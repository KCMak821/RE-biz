import { getCurrentSuperAdmin, listPlatformAuditLogs } from "@/lib/platform-admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!await getCurrentSuperAdmin()) return Response.json({ message: "需要平台管理者權限。" }, { status: 403 });
    const searchParams = new URL(request.url).searchParams;
    const auditLogs = await listPlatformAuditLogs({
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      workspaceId: searchParams.get("workspaceId") ?? undefined,
    });
    return Response.json({ auditLogs });
  } catch {
    return Response.json({ message: "無法讀取稽核紀錄。" }, { status: 503 });
  }
}
