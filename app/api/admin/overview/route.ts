import { getCurrentSuperAdmin, getPlatformOverview } from "@/lib/platform-admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (!await getCurrentSuperAdmin()) return Response.json({ message: "需要平台管理者權限。" }, { status: 403 });
    return Response.json({ overview: await getPlatformOverview() });
  } catch {
    return Response.json({ message: "無法讀取平台統計資料。" }, { status: 503 });
  }
}
