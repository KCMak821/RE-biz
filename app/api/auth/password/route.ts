import { z } from "zod";

import { changePassword, getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

const inputSchema = z.object({ currentPassword: z.string().min(1).max(200), nextPassword: z.string().min(12).max(200) }).strict();

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "新密碼至少需要 12 個字元。" }, { status: 400 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    await changePassword(user, parsed.data.currentPassword, parsed.data.nextPassword);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PASSWORD") return Response.json({ message: "目前密碼不正確。" }, { status: 400 });
    return Response.json({ message: "無法修改密碼。" }, { status: 503 });
  }
}
