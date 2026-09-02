import { getCurrentSuperAdmin, listAdminWorkspaces } from "@/lib/platform-admin";
import { readKeyword } from "@/lib/query";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!await getCurrentSuperAdmin()) return Response.json({ message: "需要平台管理者權限。" }, { status: 403 });
    const keyword = readKeyword(new URL(request.url).searchParams);
    return Response.json({ workspaces: await listAdminWorkspaces({ keyword }) });
  } catch {
    return Response.json({ message: "無法讀取工作區資料。" }, { status: 503 });
  }
}
