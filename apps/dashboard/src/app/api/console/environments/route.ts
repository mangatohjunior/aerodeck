import { connection, NextResponse } from "next/server";

import {
  ControlPlaneError,
  listControlPlaneEnvironments,
  readControlPlaneConfig,
} from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { requireSessionUser } from "@/lib/session";
import type { EnvironmentOptionPage } from "@/lib/types";

export async function GET() {
  await connection();

  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }

  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Environments stay on the control plane.", "not_found");
  }

  try {
    const items = await listControlPlaneEnvironments(config);
    const body: EnvironmentOptionPage = {
      items,
      total: items.length,
      source: "control-plane",
    };
    return NextResponse.json(body);
  } catch (cause) {
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_environments_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}
