import { z } from "zod";

import { canManageOrganizationSettings, canUseWorkspace, getCurrentUser, updateOrganizationProfile } from "@/lib/auth";

export const runtime = "nodejs";

const profileSchema = z.object({
  address: z.string().trim().max(1000),
  bankDetails: z.string().trim().max(2000),
  businessRegistration: z.string().trim().max(100),
  contact: z.string().trim().max(500),
  email: z.string().trim().email().max(320).or(z.literal("")),
  name: z.string().trim().min(1).max(300),
  phone: z.string().trim().max(100),
}).strict();

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canUseWorkspace(user)) return Response.json({ message: "此工作區目前已停用。" }, { status: 403 });
    return Response.json({ organization: user.organization });
  } catch {
    return Response.json({ message: "無法讀取公司資料。" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "公司資料格式不正確。" }, { status: 400 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageOrganizationSettings(user)) return Response.json({ message: "你沒有修改公司資料的權限。" }, { status: 403 });
    await updateOrganizationProfile(user, parsed.data);
    return Response.json({ organization: { ...user.organization, ...parsed.data } });
  } catch {
    return Response.json({ message: "無法儲存公司資料。" }, { status: 503 });
  }
}
