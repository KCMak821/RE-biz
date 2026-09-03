import { z } from "zod";

import { getCurrentSuperAdmin, setPlanArchived, updatePlan } from "@/lib/platform-admin";
import { planInputSchema } from "@/app/api/admin/plans/route";

export const runtime = "nodejs";

/** Either a full edit, or just the archive switch. */
const inputSchema = z.union([
  planInputSchema,
  z.object({ archived: z.boolean() }).strict(),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ planKey: string }> }) {
  try {
    const actor = await getCurrentSuperAdmin();
    if (!actor) return Response.json({ message: "需要平台管理者權限。" }, { status: 403 });
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ message: parsed.error.issues[0]?.message ?? "方案資料不正確。" }, { status: 400 });
    }
    const { planKey } = await params;

    if ("archived" in parsed.data) {
      if (!await setPlanArchived(actor, planKey, parsed.data.archived)) {
        return Response.json(
          { message: parsed.data.archived ? "無法封存這個方案；預設方案不能封存。" : "無法還原這個方案。" },
          { status: 409 },
        );
      }
      return Response.json({ archived: parsed.data.archived });
    }

    if (!await updatePlan(actor, planKey, parsed.data)) {
      return Response.json({ message: "無法更新方案；平台必須保留一個預設方案。" }, { status: 409 });
    }
    return Response.json({ key: planKey });
  } catch {
    return Response.json({ message: "無法更新方案。" }, { status: 503 });
  }
}
