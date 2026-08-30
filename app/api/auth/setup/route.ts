import { z } from "zod";
import { NextResponse } from "next/server";

import { createInitialOwner, createSession, sessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

const inputSchema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(12).max(200),
}).strict();

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "請填寫有效的名稱、電郵與至少 12 字元的密碼。" }, { status: 400 });

  try {
    const user = await createInitialOwner(parsed.data);
    if (!user) throw new Error("USER_NOT_FOUND");
    const session = await createSession(user.id);
    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(sessionCookie(session.token, session.expiresAt));
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "SETUP_COMPLETE") return Response.json({ message: "系統已有管理帳號，請直接登入。" }, { status: 409 });
    return Response.json({ message: "無法建立帳號，請確認資料庫設定。" }, { status: 503 });
  }
}
