import { connection, NextResponse } from "next/server";

import { INVALID_CREDENTIALS_DETAIL, isMockAuthError } from "@/lib/auth";
import {
  authenticateControlPlaneUser,
  ControlPlaneError,
  createControlPlaneSession,
  readControlPlaneConfig,
} from "@/lib/control-plane";
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

  const config = readControlPlaneConfig();
  if (config) {
    try {
      const user = await authenticateControlPlaneUser(config, payload.email, payload.password);
      const session = await createControlPlaneSession(config, user.id);
      const response = NextResponse.json(
        { id: session.user.id, email: session.user.email, created_at: session.user.created_at },
        { status: 200 },
      );
      persistSessionCookie(response, session.token);
      return response;
    } catch (cause) {
      if (cause instanceof ControlPlaneError && cause.message.includes("login rejected (401)")) {
        return jsonError(401, INVALID_CREDENTIALS_DETAIL, "invalid_credentials");
      }
      const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
      console.error("event=console_login_failed detail=%s", detail);
      return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
    }
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
