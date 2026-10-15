import { connection, NextResponse } from "next/server";

import { isMockAuthError } from "@/lib/auth";
import { jsonError } from "@/lib/mock-http";
import { loginUser } from "@/lib/mock-store";
import { persistSessionCookie } from "@/lib/session-cookie";

export async function POST(request: Request) {
  await connection();

  let payload: { email?: unknown; password?: unknown };
  try {
    payload = (await request.json()) as { email?: unknown; password?: unknown };
  } catch {
    return jsonError(400, "Request body must be JSON.", "invalid_json");
  }

  if (typeof payload.email !== "string") {
    return jsonError(400, "email is required.", "missing_email");
  }
  if (typeof payload.password !== "string") {
    return jsonError(400, "password is required.", "missing_password");
  }

  try {
    const { user, token } = loginUser(payload.email, payload.password);
    const response = NextResponse.json(user, { status: 200 });
    persistSessionCookie(response, token);
    return response;
  } catch (cause) {
    if (isMockAuthError(cause)) {
      const status = cause.code === "invalid_credentials" ? 401 : 400;
      return jsonError(status, cause.message, cause.code);
    }
    return jsonError(500, "Sign-in failed.", "login_failed");
  }
}
