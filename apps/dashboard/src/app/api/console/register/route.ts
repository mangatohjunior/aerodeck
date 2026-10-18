import { connection, NextResponse } from "next/server";

import {
  ControlPlaneError,
  readControlPlaneConfig,
  registerControlPlaneUser,
} from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";

export async function POST(request: Request) {
  await connection();

  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Registration stays on the mock API.", "not_found");
  }

  let payload: { email?: unknown; password?: unknown };
  try {
    payload = (await request.json()) as { email?: unknown; password?: unknown };
  } catch {
    return jsonError(400, "Request body must be JSON.", "invalid_json");
  }
  if (typeof payload.email !== "string" || typeof payload.password !== "string") {
    return jsonError(400, "email and password are required.", "invalid_json");
  }

  try {
    const user = await registerControlPlaneUser(config, payload.email, payload.password);
    return NextResponse.json(user, { status: 201 });
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.message.includes("conflict (409)")) {
      return jsonError(409, "That email is already registered.", "email_taken");
    }
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_register_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}
