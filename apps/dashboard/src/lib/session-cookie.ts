import type { NextResponse } from "next/server";

export const SESSION_COOKIE = "aerodeck_session";

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