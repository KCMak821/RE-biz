/**
 * Google sign-in for the platform back office.
 *
 * The authorization-code flow, with no SDK and no JWT verification of our own.
 * The code is exchanged for a token over a TLS connection to Google that is
 * authenticated by our client secret, and the profile is then read from
 * Google's own endpoint on that same channel — so the answer is already known
 * to come from Google. Hand-rolling ID-token signature checks would add a
 * second, easier-to-get-wrong way to establish the same thing.
 *
 * Nothing here reads or writes the database, and no token is ever persisted:
 * Google is used to prove an email address and then dropped.
 */

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

export type GoogleConfig = { clientId: string; clientSecret: string };

export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Where Google should send the browser back to. Derived from the request so a
 * preview deployment works without extra configuration; the exact value has to
 * be registered in the Google console.
 */
export function callbackUrl(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const origin = forwardedHost ? `${forwardedProto || "https"}://${forwardedHost}` : url.origin;
  return `${origin}/api/admin/auth/google/callback`;
}

export function authorizeUrl({
  clientId,
  redirectUri,
  state,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const params = new URLSearchParams({
    client_id: clientId,
    // Only the address and name. No Google data is stored or used elsewhere.
    scope: "openid email profile",
    // Sign-in only: never ask for offline access, so no refresh token exists.
    access_type: "online",
    prompt: "select_account",
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

export type GoogleProfile = { email: string; emailVerified: boolean; name: string };

/**
 * Exchanges the one-time code for a profile. Returns null when Google refuses
 * the exchange or answers with something unusable — the caller turns that into
 * one generic failure, so this can never be used to probe who exists.
 */
export async function fetchGoogleProfile({
  code,
  config,
  redirectUri,
}: {
  code: string;
  config: GoogleConfig;
  redirectUri: string;
}): Promise<GoogleProfile | null> {
  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!tokenResponse.ok) return null;

  const token = await tokenResponse.json().catch(() => null) as { access_token?: unknown } | null;
  const accessToken = typeof token?.access_token === "string" ? token.access_token : null;
  if (!accessToken) return null;

  const profileResponse = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!profileResponse.ok) return null;

  const profile = await profileResponse.json().catch(() => null) as {
    email?: unknown;
    email_verified?: unknown;
    name?: unknown;
  } | null;
  const email = typeof profile?.email === "string" ? profile.email : null;
  if (!email) return null;

  return {
    email,
    // An unverified address proves nothing about who is signing in.
    emailVerified: profile?.email_verified === true,
    name: typeof profile?.name === "string" ? profile.name : email,
  };
}
