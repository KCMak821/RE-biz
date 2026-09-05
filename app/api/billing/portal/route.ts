import { getCurrentUser } from "@/lib/auth";
import { billingOrigin, getStripe, StripeConfigurationError } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ message: "登入已逾期，請重新登入。" }, { status: 401 });
  if (user.organization.role !== "owner") return Response.json({ message: "只有公司擁有者可以管理訂閱。" }, { status: 403 });
  const customerId = user.organization.subscription.externalCustomerId;
  if (!customerId) return Response.json({ message: "尚未開始 Stripe 訂閱。" }, { status: 409 });

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${billingOrigin(request)}/settings/billing`,
    });
    return Response.json({ url: session.url });
  } catch (error) {
    if (error instanceof StripeConfigurationError) return Response.json({ message: error.message }, { status: 503 });
    console.error("Stripe Customer Portal could not be created", error);
    return Response.json({ message: "無法開啟訂閱管理，請稍後再試。" }, { status: 502 });
  }
}
