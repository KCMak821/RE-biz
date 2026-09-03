import { z } from "zod";

import { getCurrentSuperAdmin, updateWorkspaceSubscription } from "@/lib/platform-admin";
import { planKeys, subscriptionStatuses } from "@/lib/subscription";

export const runtime = "nodejs";

/**
 * `null` clears a date; omitting the key leaves it as it is. The two are
 * different intents and the schema keeps them apart.
 */
const dateField = z.string().date().nullable().optional();

const inputSchema = z.object({
  currentPeriodEnd: dateField,
  note: z.string().max(500).nullable().optional(),
  planKey: z.enum(planKeys).optional(),
  status: z.enum(subscriptionStatuses).optional(),
  trialEndsAt: dateField,
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "訂閱資料不正確。" }, { status: 400 });
  if (!Object.keys(parsed.data).length) return Response.json({ message: "沒有要變更的欄位。" }, { status: 400 });

  try {
    const actor = await getCurrentSuperAdmin();
    if (!actor) return Response.json({ message: "需要平台管理者權限。" }, { status: 403 });
    const { workspaceId } = await params;
    if (!await updateWorkspaceSubscription(actor, workspaceId, parsed.data)) {
      return Response.json({ message: "工作區不存在。" }, { status: 404 });
    }
    return Response.json({ subscription: parsed.data });
  } catch {
    return Response.json({ message: "無法更新訂閱資料。" }, { status: 503 });
  }
}
