import { z } from "zod";

import { canCreateRole, canManageMembers, createMember, getCurrentUser, listMembers } from "@/lib/auth";

export const runtime = "nodejs";

const inputSchema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(12).max(200),
  role: z.enum(["admin", "operator", "viewer"]),
}).strict();

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageMembers(user)) return Response.json({ message: "你沒有管理成員的權限。" }, { status: 403 });
    return Response.json({ members: await listMembers(user) });
  } catch {
    return Response.json({ message: "無法讀取成員資料。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "請填寫姓名、有效 Email、角色與至少 12 字元的暫用密碼。" }, { status: 400 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageMembers(user) || !canCreateRole(user, parsed.data.role)) return Response.json({ message: "你沒有建立此角色帳號的權限。" }, { status: 403 });
    const member = await createMember(parsed.data, user);
    return Response.json({ member }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_TAKEN") return Response.json({ message: "此 Email 已被使用。" }, { status: 409 });
    return Response.json({ message: "無法建立帳號。" }, { status: 503 });
  }
}
