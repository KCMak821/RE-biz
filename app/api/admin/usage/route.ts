import { getCurrentSuperAdmin, getWorkspaceUsage, listAdminWorkspaces } from "@/lib/platform-admin";
import { ObjectId } from "mongodb";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (!await getCurrentSuperAdmin()) return Response.json({ message: "需要平台管理者權限。" }, { status: 403 });
    const workspaces = await listAdminWorkspaces();
    const usage = await Promise.all(workspaces.map(async (workspace) => ({ ...workspace, usage: await getWorkspaceUsage(new ObjectId(workspace.id)) })));
    return Response.json({ workspaces: usage });
  } catch {
    return Response.json({ message: "無法讀取使用量資料。" }, { status: 503 });
  }
}
