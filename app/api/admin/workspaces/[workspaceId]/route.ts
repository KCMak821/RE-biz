import { z } from "zod";

import { getAdminWorkspace, getCurrentSuperAdmin, updateWorkspaceStatus } from "@/lib/platform-admin";

export const runtime = "nodejs";
const inputSchema = z.object({ status: z.enum(["active", "suspended"]) }).strict();

export async function GET(_: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    if (!await getCurrentSuperAdmin()) return Response.json({ message: "需要平台管理者權限。" }, { status: 403 });
    const { workspaceId } = await params;
    const workspace = await getAdminWorkspace(workspaceId);
    return workspace ? Response.json({ workspace }) : Response.json({ message: "工作區不存在。" }, { status: 404 });
  } catch {
    return Response.json({ message: "無法讀取工作區資料。" }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "工作區狀態不正確。" }, { status: 400 });
  try {
    const actor = await getCurrentSuperAdmin();
    if (!actor) return Response.json({ message: "需要平台管理者權限。" }, { status: 403 });
    const { workspaceId } = await params;
    if (!await updateWorkspaceStatus(actor, workspaceId, parsed.data.status)) return Response.json({ message: "工作區不存在。" }, { status: 404 });
    return Response.json({ status: parsed.data.status });
  } catch {
    return Response.json({ message: "無法更新工作區狀態。" }, { status: 503 });
  }
}
