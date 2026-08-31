import { z } from "zod";

import { getCurrentSuperAdmin, updateWorkspaceFeature, workspaceFeatureKeys } from "@/lib/platform-admin";

export const runtime = "nodejs";
const inputSchema = z.object({ enabled: z.boolean() }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ featureKey: string; workspaceId: string }> }) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "功能開關資料不正確。" }, { status: 400 });
  try {
    const actor = await getCurrentSuperAdmin();
    if (!actor) return Response.json({ message: "需要平台管理者權限。" }, { status: 403 });
    const { featureKey, workspaceId } = await params;
    if (!(workspaceFeatureKeys as readonly string[]).includes(featureKey)) return Response.json({ message: "功能不存在。" }, { status: 404 });
    if (!await updateWorkspaceFeature(actor, workspaceId, featureKey as (typeof workspaceFeatureKeys)[number], parsed.data.enabled)) return Response.json({ message: "工作區不存在。" }, { status: 404 });
    return Response.json({ enabled: parsed.data.enabled, featureKey });
  } catch {
    return Response.json({ message: "無法更新功能開關。" }, { status: 503 });
  }
}
