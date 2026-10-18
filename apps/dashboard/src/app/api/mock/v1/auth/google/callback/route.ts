import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";

import {
  ControlPlaneError,
  createControlPlaneSession,
  linkControlPlaneGoogleUser,
  readControlPlaneConfig,
} from "@/lib/control-plane";
import {
  MOCK_GOOGLE_EMAIL,
  MOCK_GOOGLE_SUBJECT,
  exchangeGoogleCode,
  isRealGoogleConfigured,
  statesMatch,
} from "@/lib/google-oauth";
import { loginGoogleUser } from "@/lib/mock-store";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  clearOauthCookies,
  persistSessionCookie,
} from "@/lib/session-cookie";

function loginError(origin: string) {
  const login = new URL("/login", origin);
  login.searchParams.set("google", "error");
  const response = NextResponse.redirect(login);
  clearOauthCookies(response);
  return response;
}

export async function GET(request: Request) {
  await connection();

  const incoming = new URL(request.url);
  const origin = incoming.origin;
  const jar = await cookies();
  const expectedState = jar.get(OAUTH_STATE_COOKIE)?.value;
  const receivedState = incoming.searchParams.get("state") ?? undefined;

  if (incoming.searchParams.get("error")) {
    return loginError(origin);
  }

  if (!statesMatch(expectedState, receivedState)) {
    return loginError(origin);
  }

  try {
    const code = incoming.searchParams.get("code");
    const profile = await resolveGoogleProfile(incoming, jar.get(OAUTH_VERIFIER_COOKIE)?.value);
    const config = readControlPlaneConfig();
    const token =
      config && code && isRealGoogleConfigured()
        ? (
            await createControlPlaneSession(
              config,
              (await linkControlPlaneGoogleUser(config, profile.email, profile.subject)).id,
            )
          ).token
        : loginGoogleUser(profile.email, profile.subject).token;
    const response = NextResponse.redirect(new URL("/", origin));
    persistSessionCookie(response, token);
    clearOauthCookies(response);
    return response;
  } catch (cause) {
    if (cause instanceof ControlPlaneError) {
      console.error("event=console_google_link_failed detail=%s", cause.message);
    }
    return loginError(origin);
  }
}

async function resolveGoogleProfile(
  incoming: URL,
  verifier: string | undefined,
): Promise<{ email: string; subject: string }> {
  const code = incoming.searchParams.get("code");
  if (code && isRealGoogleConfigured()) {
    if (!verifier) {
      throw new Error("missing_pkce_verifier");
    }
    return exchangeGoogleCode(incoming.origin, code, verifier);
  }

  if (incoming.searchParams.get("mock") === "1") {
    return { email: MOCK_GOOGLE_EMAIL, subject: MOCK_GOOGLE_SUBJECT };
  }

  throw new Error("unsupported_google_callback");
}
