import { createHmac, timingSafeEqual } from "node:crypto";

import { type SubscriptionStatus } from "@/lib/subscription";

/**
 * Verifying and reading Stripe webhooks.
 *
 * Deliberately no Stripe SDK and no API key. RE-Biz only *receives* events, and
 * verifying one is an HMAC over the raw body — so this needs the signing secret
 * and nothing else. No secret key lives in the app, and nothing here can move
 * money or call Stripe back.
 *
 * Events update what a company is *recorded* as paying. They never suspend a
 * workspace or take a feature away: a failed payment becomes "past due" in the
 * platform admin for a human to look at, exactly like an expired trial.
 */

const DEFAULT_TOLERANCE_SECONDS = 300;

export type StripeSignatureFailure =
  | "missing_secret"
  | "missing_signature"
  | "malformed_signature"
  | "no_match"
  | "stale_timestamp";

export type StripeVerification =
  | { ok: true }
  | { ok: false; reason: StripeSignatureFailure };

/**
 * Checks a `Stripe-Signature` header against the raw request body.
 *
 * The body must be the exact bytes Stripe sent: re-serialising parsed JSON
 * changes the payload and every signature then fails.
 */
export function verifyStripeSignature({
  header,
  now = Date.now(),
  payload,
  secret,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
}: {
  header: string | null;
  now?: number;
  payload: string;
  secret: string | undefined;
  toleranceSeconds?: number;
}): StripeVerification {
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (!header) return { ok: false, reason: "missing_signature" };

  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=");
    if (key === "t") timestamp = value ?? "";
    if (key === "v1" && value) signatures.push(value);
  }
  if (!timestamp || !signatures.length) return { ok: false, reason: "malformed_signature" };

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return { ok: false, reason: "malformed_signature" };
  // A replayed event from hours ago must not be accepted just because the
  // signature is genuine.
  if (Math.abs(now / 1000 - seconds) > toleranceSeconds) return { ok: false, reason: "stale_timestamp" };

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const matched = signatures.some((signature) => {
    const candidate = Buffer.from(signature, "utf8");
    // timingSafeEqual throws on a length mismatch, which is itself a non-match.
    return candidate.length === expectedBuffer.length && timingSafeEqual(candidate, expectedBuffer);
  });
  return matched ? { ok: true } : { ok: false, reason: "no_match" };
}

/** Stripe's subscription states, reduced to the four this platform records. */
export function toSubscriptionStatus(stripeStatus: string | undefined): SubscriptionStatus | null {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    // "incomplete" and "paused" are transitional; leaving the recorded status
    // alone is more honest than guessing at one.
    default:
      return null;
  }
}

export type StripeSubscriptionUpdate = {
  currentPeriodEnd: string | null;
  customerId: string;
  eventId: string;
  priceId: string | null;
  status: SubscriptionStatus | null;
  subscriptionId: string | null;
  type: string;
};

/** The completed Checkout Session securely ties a Stripe customer to a workspace. */
export type StripeCheckoutUpdate = {
  customerId: string;
  eventId: string;
  planKey: string;
  subscriptionId: string | null;
  type: string;
  workspaceId: string;
};

/**
 * The identity of any verified event, including the ones nothing acts on.
 *
 * Recorded so the back office can tell "Stripe is not reaching us" apart from
 * "Stripe is reaching us and sending events we do not act on" — during setup
 * those look identical from the outside and have completely different fixes.
 */
export type StripeEventEnvelope = { id: string; type: string };

export function readStripeEnvelope(event: unknown): StripeEventEnvelope | null {
  if (typeof event !== "object" || !event) return null;
  const { id, type } = event as { id?: unknown; type?: unknown };
  return typeof id === "string" && id && typeof type === "string" && type ? { id, type } : null;
}

type StripeEvent = {
  data?: { object?: Record<string, unknown> };
  id?: string;
  type?: string;
};

function asString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function metadataString(value: unknown, key: string) {
  if (typeof value !== "object" || !value) return null;
  return asString((value as Record<string, unknown>)[key]);
}

/** Unix seconds to an ISO date, or null when Stripe did not send one. */
function toIsoDate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}

/**
 * The events worth acting on, flattened into one shape. Anything else returns
 * null and is acknowledged without changing a record — Stripe retries whatever
 * it does not get a 2xx for, so unknown events must still succeed.
 */
export function readStripeEvent(event: unknown): StripeSubscriptionUpdate | null {
  if (typeof event !== "object" || !event) return null;
  const { data, id, type } = event as StripeEvent;
  const object = data?.object;
  const eventId = asString(id);
  if (!eventId || !object) return null;

  if (type === "customer.subscription.created" || type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
    const customerId = asString(object.customer);
    if (!customerId) return null;
    const items = object.items as { data?: Array<{ price?: { id?: unknown } }> } | undefined;
    return {
      currentPeriodEnd: toIsoDate(object.current_period_end),
      customerId,
      eventId,
      priceId: asString(items?.data?.[0]?.price?.id),
      status: type === "customer.subscription.deleted"
        ? "canceled"
        : toSubscriptionStatus(asString(object.status) ?? undefined),
      subscriptionId: asString(object.id),
      type,
    };
  }

  if (type === "invoice.payment_failed" || type === "invoice.payment_succeeded") {
    const customerId = asString(object.customer);
    if (!customerId) return null;
    return {
      currentPeriodEnd: null,
      customerId,
      eventId,
      priceId: null,
      status: type === "invoice.payment_failed" ? "past_due" : "active",
      subscriptionId: asString(object.subscription),
      type,
    };
  }

  return null;
}

/** Checkout carries our workspace metadata; subscription events supply dates. */
export function readStripeCheckoutEvent(event: unknown): StripeCheckoutUpdate | null {
  if (typeof event !== "object" || !event) return null;
  const { data, id, type } = event as StripeEvent;
  if (type !== "checkout.session.completed") return null;
  const object = data?.object;
  const eventId = asString(id);
  if (!eventId || !object) return null;

  const workspaceId = asString(object.client_reference_id) ?? metadataString(object.metadata, "workspaceId");
  const planKey = metadataString(object.metadata, "planKey");
  const customerId = asString(object.customer);
  if (!workspaceId || !planKey || !customerId) return null;
  return { customerId, eventId, planKey, subscriptionId: asString(object.subscription), type, workspaceId };
}
