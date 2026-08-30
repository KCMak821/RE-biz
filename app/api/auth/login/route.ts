import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateUser, createSession, sessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

const inputSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(200),
}).strict();

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "請填寫電郵與密碼。" }, { status: 400 });

  try {
    const user = await authenticateUser(parsed.data.email, parsed.data.password);
    if (!user) return Response.json({ message: "電郵或密碼不正確。" }, { status: 401 });

    const session = await createSession(user.id);
    const response = NextResponse.json({ user });
    response.cookies.set(sessionCookie(session.token, session.expiresAt));
    return response;
  } catch {
    return Response.json({ message: "資料庫暫時無法使用。" }, { status: 503 });
  }
}
