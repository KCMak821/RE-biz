import { z } from "zod";

import { canManageMembers, getCurrentUser, updateMemberStatus } from "@/lib/auth";

export const runtime = "nodejs";

const inputSchema = z.object({ status: z.enum(["active", "suspended"]) }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ memberId: string }> }) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "無效的成員狀態。" }, { status: 400 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageMembers(user)) return Response.json({ message: "你沒有管理成員的權限。" }, { status: 403 });
    const { memberId } = await context.params;
    await updateMemberStatus(user, memberId, parsed.data.status);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "MEMBER_FORBIDDEN") return Response.json({ message: "此成員不能由你變更。" }, { status: 403 });
    return Response.json({ message: "無法更新成員狀態。" }, { status: 503 });
  }
}
