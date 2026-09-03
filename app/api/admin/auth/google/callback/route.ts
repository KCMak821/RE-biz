import { NextResponse } from "next/server";

import { callbackUrl, fetchGoogleProfile, googleConfig } from "@/lib/google-oauth";
import { oauthStateCookieName } from "@/app/api/admin/auth/google/start/route";
import {
  createPlatformAdminSession,
  isAllowedPlatformAdmin,
  platformAdminSessionCookie,
  recordPlatformAdminSignIn,
} from "@/lib/platform-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(request: Request, error: string) {
  const response = NextResponse.redirect(new URL(`/admin/login?error=${error}`, request.url));
  response.cookies.set(oauthStateCookieName, "", { expires: new Date(0), path: "/" });
  return response;
}

export async function GET(request: Request) {
  const config = googleConfig();
  if (!config) return back(request, "not_configured");

  const url = new URL(request.url);
  // Google reports a refusal here rather than by failing the exchange.
  if (url.searchParams.get("error")) return back(request, "cancelled");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === oauthStateCookieName)?.[1];
  if (!code || !state || !expectedState || state !== expectedState) return back(request, "bad_state");

  const profile = await fetchGoogleProfile({ code, config, redirectUri: callbackUrl(request) });
  if (!profile) return back(request, "exchange_failed");
  if (!profile.emailVerified) return back(request, "unverified_email");
  // The allowlist is the only thing that grants platform access. Signing in
  // with Google proves who you are; it does not make you an administrator.
  if (!isAllowedPlatformAdmin(profile.email)) return back(request, "not_allowed");

  const actor = await recordPlatformAdminSignIn({ email: profile.email, name: profile.name });
  const session = await createPlatformAdminSession(actor.id);
  const response = NextResponse.redirect(new URL("/admin", request.url));
  response.cookies.set(platformAdminSessionCookie(session.token, session.expiresAt));
  response.cookies.set(oauthStateCookieName, "", { expires: new Date(0), path: "/" });
  return response;
}
