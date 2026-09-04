import { applyStripeSubscription, recordIgnoredStripeEvent } from "@/lib/platform-admin";
import { readStripeEnvelope, readStripeEvent, verifyStripeSignature } from "@/lib/stripe-webhook";

export const runtime = "nodejs";
/** The raw body is what Stripe signed, so it must not be cached or rewritten. */
export const dynamic = "force-dynamic";

/**
 * Stripe's webhook endpoint.
 *
 * The only thing on this platform that is not behind a login, so it earns its
 * access with a signature over the raw body and nothing else — no API key, and
 * no way to reach anything but a company's recorded subscription.
 *
 * Everything it cannot act on is still acknowledged with a 2xx: Stripe retries
 * anything else, and an event for an unlinked customer is not a failure worth
 * retrying forever.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Not configured is a deployment state, not a caller error. Say so plainly
    // without confirming or denying anything about the payload.
    return Response.json({ message: "Stripe webhook is not configured." }, { status: 503 });
  }

  const payload = await request.text();
  const verification = verifyStripeSignature({
    header: request.headers.get("stripe-signature"),
    payload,
    secret,
  });
  if (!verification.ok) {
    console.error(`Stripe webhook rejected: ${verification.reason}`);
    return Response.json({ message: "Invalid signature." }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ message: "Invalid payload." }, { status: 400 });
  }

  const update = readStripeEvent(event);
  if (!update) {
    // Verified, but nothing here acts on it. Noting it is what lets the billing
    // page say "Stripe is reaching us" during setup.
    const envelope = readStripeEnvelope(event);
    if (envelope) await recordIgnoredStripeEvent(envelope).catch(() => {});
    return Response.json({ ignored: true });
  }

  try {
    const outcome = await applyStripeSubscription(update);
    // A customer nobody has linked to a workspace is logged, not retried: the
    // fix is to paste the customer id into the workspace, not to resend.
    if (outcome === "no_match") {
      console.error(`Stripe webhook matched no workspace for customer ${update.customerId}`);
    }
    return Response.json({ outcome });
  } catch {
    // A real failure: let Stripe retry.
    return Response.json({ message: "Could not record the subscription." }, { status: 503 });
  }
}
