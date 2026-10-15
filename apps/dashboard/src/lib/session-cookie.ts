import type { NextResponse } from "next/server";

export const SESSION_COOKIE = "aerodeck_session";
export const OAUTH_STATE_COOKIE = "aerodeck_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "aerodeck_oauth_verifier";

const WEEK_SECONDS = 60 * 60 * 24 * 7;

function cookieBase() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

export function persistSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    ...cookieBase(),
    maxAge: WEEK_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    ...cookieBase(),
    maxAge: 0,
  });
}

const OAUTH_COOKIE_SECONDS = 10 * 60;

export function persistOauthCookies(
  response: NextResponse,
  state: string,
  verifier?: string,
) {
  const options = { ...cookieBase(), maxAge: OAUTH_COOKIE_SECONDS };
  response.cookies.set(OAUTH_STATE_COOKIE, state, options);
  if (verifier) {
    response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, options);
  }
}

export function clearOauthCookies(response: NextResponse) {
  const options = { ...cookieBase(), maxAge: 0 };
  response.cookies.set(OAUTH_STATE_COOKIE, "", options);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, "", options);
}