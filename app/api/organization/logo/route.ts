import { Binary } from "mongodb";

import { canUseWorkspace, getCurrentUser, getOrganizationLogo } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canUseWorkspace(user)) return Response.json({ message: "此工作區目前已停用。" }, { status: 403 });
    const logo = await getOrganizationLogo(user);
    if (!logo) return Response.json({ message: "尚未設定公司 Logo。" }, { status: 404 });
    const data = logo.data instanceof Binary ? Buffer.from(logo.data.buffer) : logo.data;
    return new Response(new Uint8Array(data), { headers: { "Cache-Control": "no-store, private", "Content-Type": logo.contentType } });
  } catch {
    return Response.json({ message: "無法讀取公司 Logo。" }, { status: 503 });
  }
}
