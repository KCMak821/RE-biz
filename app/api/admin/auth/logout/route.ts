import { NextResponse } from "next/server";

import { deleteCurrentPlatformAdminSession, platformAdminSessionCookieName } from "@/lib/platform-auth";

export const runtime = "nodejs";

export async function POST() {
  await deleteCurrentPlatformAdminSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(platformAdminSessionCookieName, "", { expires: new Date(0), httpOnly: true, path: "/", sameSite: "lax" });
  return response;
}
