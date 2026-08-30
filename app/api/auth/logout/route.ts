import { NextResponse } from "next/server";

import { deleteCurrentSession, sessionCookieName } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await deleteCurrentSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName, "", { expires: new Date(0), httpOnly: true, path: "/", sameSite: "lax" });
  return response;
}
