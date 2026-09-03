import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { authorizeUrl, callbackUrl, googleConfig } from "@/lib/google-oauth";
import { platformAdminAccessConfigured } from "@/lib/platform-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Short-lived: it only has to survive the round trip to Google. */
export const oauthStateCookieName = "rebiz_admin_oauth_state";

export async function GET(request: Request) {
  const config = googleConfig();
  if (!config || !platformAdminAccessConfigured()) {
    return NextResponse.redirect(new URL("/admin/login?error=not_configured", request.url));
  }

  // The state is compared on the way back, so a callback the user did not
  // start cannot sign anyone in.
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(
    authorizeUrl({ clientId: config.clientId, redirectUri: callbackUrl(request), state }),
  );
  response.cookies.set({
    name: oauthStateCookieName,
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: state,
  });
  return response;
}
