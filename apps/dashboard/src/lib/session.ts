import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { readControlPlaneConfig, readControlPlaneSession } from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { getUserBySessionToken } from "@/lib/mock-store";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { lookupSession, type SessionRead } from "@/lib/session-lookup";
import type { PublicUser } from "@/lib/types";

export type { SessionRead } from "@/lib/session-lookup";
export {
  controlPlaneSessionToRevoke,
  isMissingControlPlaneSession,
  lookupSession,
} from "@/lib/session-lookup";

export async function readSession(): Promise<SessionRead> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const config = readControlPlaneConfig();
  return lookupSession({
    token,
    config,
    mockUser: getUserBySessionToken(token),
    resolve: config
      ? (value) => readControlPlaneSession(config, value)
      : undefined,
  });
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
