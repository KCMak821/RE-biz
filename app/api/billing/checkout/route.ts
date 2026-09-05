import { ObjectId } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { getPlan } from "@/lib/plans";
import { billingOrigin, getStripe, StripeConfigurationError } from "@/lib/stripe";

export const runtime = "nodejs";

/** The only public paid offer. VVVVIP is deliberately never accepted here. */
const publicPlanKey = "plus";
const trialDays = 30;

export async function POST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ message: "登入已逾期，請重新登入。" }, { status: 401 });
  if (user.organization.role !== "owner") return Response.json({ message: "只有公司擁有者可以開始訂閱。" }, { status: 403 });

  try {
    const plan = await getPlan(publicPlanKey);
    if (!plan || plan.archived || !plan.stripePriceId) {
      return Response.json({ message: "Plus 方案尚未對應 Stripe 月繳 Price，請聯絡管理員。" }, { status: 409 });
    }

    const organization = await (await getDatabase()).collection("organizations").findOne(
      { _id: new ObjectId(user.organization.id) }, { projection: { subscription: 1 } },
    );
    if (!organization) return Response.json({ message: "找不到公司資料。" }, { status: 404 });
    if (organization.subscription?.externalSubscriptionId) {
      return Response.json({ message: "這間公司已有 Stripe 訂閱，請使用管理訂閱。" }, { status: 409 });
    }

    const origin = billingOrigin(request);
    const session = await getStripe().checkout.sessions.create({
      cancel_url: `${origin}/settings/billing?checkout=cancelled`,
      client_reference_id: user.organization.id,
      customer: organization.subscription?.externalCustomerId,
      customer_email: organization.subscription?.externalCustomerId ? undefined : user.email,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      metadata: { planKey: publicPlanKey, workspaceId: user.organization.id },
      mode: "subscription",
      payment_method_collection: "always",
      subscription_data: {
        metadata: { planKey: publicPlanKey, workspaceId: user.organization.id },
        trial_period_days: trialDays,
      },
      success_url: `${origin}/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    });
    if (!session.url) return Response.json({ message: "無法建立付款頁面，請稍後再試。" }, { status: 502 });
    return Response.json({ url: session.url });
  } catch (error) {
    if (error instanceof StripeConfigurationError) return Response.json({ message: error.message }, { status: 503 });
    console.error("Stripe Checkout could not be created", error);
    return Response.json({ message: "無法建立付款頁面，請稍後再試。" }, { status: 502 });
  }
}
