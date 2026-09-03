import { getCurrentSuperAdmin, listAdminWorkspaces } from "@/lib/platform-admin";
import { readKeyword } from "@/lib/query";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!await getCurrentSuperAdmin()) return Response.json({ message: "需要平台管理者權限。" }, { status: 403 });
    const searchParams = new URL(request.url).searchParams;
    // The same filters the page uses, so a URL copied out of the admin can be
    // replayed against the API. Unrecognised values are ignored rather than
    // matching nothing.
    return Response.json({
      workspaces: await listAdminWorkspaces({
        keyword: readKeyword(searchParams),
        planKey: searchParams.get("plan") ?? undefined,
        subscriptionStatus: searchParams.get("subscription") ?? undefined,
      }),
    });
  } catch {
    return Response.json({ message: "無法讀取工作區資料。" }, { status: 503 });
  }
}
