import { connection, NextResponse } from "next/server";

import { isMockAuthError } from "@/lib/auth";
import { jsonError } from "@/lib/mock-http";
import { registerUser } from "@/lib/mock-store";

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
    const user = registerUser(payload.email, payload.password);
    return NextResponse.json(user, { status: 201 });
  } catch (cause) {
    if (isMockAuthError(cause)) {
      const status = cause.code === "email_taken" ? 409 : 400;
      return jsonError(status, cause.message, cause.code);
    }
    return jsonError(500, "Registration failed.", "register_failed");
  }
}
