import { Binary } from "mongodb";

import { canManageOrganizationSettings, getCurrentUser, getOrganizationSeal, updateOrganizationSeal } from "@/lib/auth";

export const runtime = "nodejs";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxSealSize = 2 * 1024 * 1024;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    const seal = await getOrganizationSeal(user);
    if (!seal) return Response.json({ message: "尚未上傳公司印章。" }, { status: 404 });
    const data = seal.data instanceof Binary ? Buffer.from(seal.data.buffer) : seal.data;
    return new Response(new Uint8Array(data), { headers: { "Cache-Control": "no-store, private", "Content-Type": seal.contentType } });
  } catch {
    return Response.json({ message: "無法讀取公司印章。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageOrganizationSettings(user)) return Response.json({ message: "你沒有修改公司收據樣式的權限。" }, { status: 403 });
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || !allowedTypes.has(file.type) || !file.size || file.size > maxSealSize) {
      return Response.json({ message: "印章只支援 PNG、JPG 或 WebP，檔案需小於 2 MB。" }, { status: 400 });
    }
    const updatedAt = new Date();
    await updateOrganizationSeal(user, { contentType: file.type as "image/jpeg" | "image/png" | "image/webp", data: Buffer.from(await file.arrayBuffer()), updatedAt });
    return Response.json({ hasSealImage: true, sealUpdatedAt: updatedAt.toISOString() });
  } catch {
    return Response.json({ message: "無法上傳公司印章。" }, { status: 503 });
  }
}
