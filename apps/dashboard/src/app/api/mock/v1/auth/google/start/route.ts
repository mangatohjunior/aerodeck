import { connection, NextResponse } from "next/server";

import {
  GOOGLE_CALLBACK_PATH,
  createPkce,
  googleAuthorizeUrl,
  isRealGoogleConfigured,
  newOauthState,
} from "@/lib/google-oauth";
import { persistOauthCookies } from "@/lib/session-cookie";

export async function GET(request: Request) {
  await connection();

  const incoming = new URL(request.url);
  const state = newOauthState();
  const origin = incoming.origin;

  if (incoming.searchParams.get("error") === "1") {
    const callback = new URL(GOOGLE_CALLBACK_PATH, origin);
    callback.searchParams.set("state", state);
    callback.searchParams.set("error", "access_denied");
    const response = NextResponse.redirect(callback);
    persistOauthCookies(response, state);
    return response;
  }

  if (isRealGoogleConfigured()) {
    const pkce = createPkce();
    const response = NextResponse.redirect(
      googleAuthorizeUrl(origin, state, pkce.challenge),
    );
    persistOauthCookies(response, state, pkce.verifier);
    return response;
  }

  const callback = new URL(GOOGLE_CALLBACK_PATH, origin);
  callback.searchParams.set("state", state);
  callback.searchParams.set("mock", "1");
  const response = NextResponse.redirect(callback);
  persistOauthCookies(response, state);
  return response;
}
