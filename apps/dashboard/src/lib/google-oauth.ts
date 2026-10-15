import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { GOOGLE_CALLBACK_PATH } from "@/lib/google-auth";

export {
  GOOGLE_CALLBACK_PATH,
  GOOGLE_START_PATH,
  MOCK_GOOGLE_EMAIL,
  MOCK_GOOGLE_SUBJECT,
} from "@/lib/google-auth";

export function isRealGoogleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export function newOauthState() {
  return randomBytes(16).toString("hex");
}

export function createPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function statesMatch(expected: string | undefined, received: string | undefined) {
  if (!expected || !received) {
    return false;
  }
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function googleAuthorizeUrl(origin: string, state: string, challenge: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not set.");
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${origin}${GOOGLE_CALLBACK_PATH}`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url;
}

export async function exchangeGoogleCode(
  origin: string,
  code: string,
  verifier: string,
): Promise<{ email: string; subject: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${origin}${GOOGLE_CALLBACK_PATH}`,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });

  const payload = (await tokenResponse.json()) as {
    id_token?: string;
    error?: string;
  };
  if (!tokenResponse.ok || !payload.id_token) {
    throw new Error(payload.error ?? "google_token_exchange_failed");
  }

  const claims = decodeJwtPayload(payload.id_token);
  const email = typeof claims.email === "string" ? claims.email : "";
  const subject = typeof claims.sub === "string" ? claims.sub : "";
  if (!email || !subject || claims.email_verified === false) {
    throw new Error("google_email_unverified");
  }

  return { email, subject };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) {
    return {};
  }
  const json = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}
