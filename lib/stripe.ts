import Stripe from "stripe";

/** The only place server-side Stripe credentials are read. */
let client: Stripe | null = null;

export class StripeConfigurationError extends Error {
  constructor() {
    super("Stripe 尚未設定。請聯絡管理員完成付款服務設定。");
  }
}

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new StripeConfigurationError();
  client ??= new Stripe(secretKey);
  return client;
}

/** Checkout and Portal return to the public origin, not an arbitrary Host header. */
export function billingOrigin(request: Request) {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (configured) {
    const url = new URL(configured);
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  }
  return new URL(request.url).origin;
}
