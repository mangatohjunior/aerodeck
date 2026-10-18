import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ControlPlaneError, readControlPlaneConfig, readControlPlaneSession } from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { getUserBySessionToken } from "@/lib/mock-store";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import type { PublicUser } from "@/lib/types";

export type SessionRead =
  | { status: "user"; user: PublicUser }
  | { status: "anonymous" }
  | { status: "unavailable" };

export function isMissingControlPlaneSession(cause: ControlPlaneError): boolean {
  return cause.message.includes("not found (404)");
}

export async function readSession(): Promise<SessionRead> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return { status: "anonymous" };
  }
  const config = readControlPlaneConfig();
  if (!config) {
    const user = getUserBySessionToken(token);
    return user ? { status: "user", user } : { status: "anonymous" };
  }
  try {
    return { status: "user", user: await readControlPlaneSession(config, token) };
  } catch (cause) {
    if (!(cause instanceof ControlPlaneError)) {
      throw cause;
    }
    if (isMissingControlPlaneSession(cause)) {
      return { status: "anonymous" };
    }
    console.error("event=console_session_failed detail=%s", cause.message);
    return { status: "unavailable" };
  }
}

export async function requireSessionUser(): Promise<PublicUser | NextResponse> {
  const session = await readSession();
  if (session.status === "user") {
    return session.user;
  }
  if (session.status === "unavailable") {
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
  return jsonError(401, "Not signed in.", "unauthenticated");
}
