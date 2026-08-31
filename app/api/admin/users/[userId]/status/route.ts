import { z } from "zod";

import { getCurrentSuperAdmin, updatePlatformUserStatus } from "@/lib/platform-admin";

export const runtime = "nodejs";
const inputSchema = z.object({ status: z.enum(["active", "disabled"]) }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "帳號狀態不正確。" }, { status: 400 });
  try {
    const actor = await getCurrentSuperAdmin();
    if (!actor) return Response.json({ message: "需要平台管理者權限。" }, { status: 403 });
    const { userId } = await params;
    if (!await updatePlatformUserStatus(actor, userId, parsed.data.status)) return Response.json({ message: "無法變更此帳號；不可停用自己的帳號。" }, { status: 404 });
    return Response.json({ status: parsed.data.status });
  } catch {
    return Response.json({ message: "無法更新帳號狀態。" }, { status: 503 });
  }
}
