import { cookies } from "next/headers";

import { ControlPlaneError, readControlPlaneConfig, readControlPlaneSession } from "@/lib/control-plane";
import { getUserBySessionToken } from "@/lib/mock-store";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import type { PublicUser } from "@/lib/types";

export async function getSessionUser(): Promise<PublicUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  const config = readControlPlaneConfig();
  if (!config) {
    return getUserBySessionToken(token) ?? null;
  }
  try {
    return await readControlPlaneSession(config, token);
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.message.includes("not found (404)")) {
      return null;
    }
    throw cause;
  }
}
