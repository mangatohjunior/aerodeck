import { connection, NextResponse } from "next/server";

import { ControlPlaneError } from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  await connection();

  try {
    const user = await getSessionUser();
    if (!user) {
      return jsonError(401, "Not signed in.", "unauthenticated");
    }
    return NextResponse.json(user);
  } catch (cause) {
    if (cause instanceof ControlPlaneError) {
      console.error("event=console_session_failed detail=%s", cause.message);
      return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
    }
    throw cause;
  }
}
