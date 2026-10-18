import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";

import { ControlPlaneError, readControlPlaneConfig, revokeControlPlaneSession } from "@/lib/control-plane";
import { destroySession } from "@/lib/mock-store";
import { SESSION_COOKIE, clearSessionCookie } from "@/lib/session-cookie";

export async function POST() {
  await connection();

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const config = readControlPlaneConfig();
  if (token && config) {
    try {
      await revokeControlPlaneSession(config, token);
    } catch (cause) {
      if (cause instanceof ControlPlaneError) {
        console.error("event=console_logout_failed detail=%s", cause.message);
      }
    }
  }
  if (token) {
    destroySession(token);
  }

  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response);
  return response;
}
