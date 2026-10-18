import { connection, NextResponse } from "next/server";

import {
  ControlPlaneError,
  listControlPlaneSandboxes,
  readControlPlaneConfig,
} from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { listSandboxes } from "@/lib/mock-store";
import { getSessionUser } from "@/lib/session";
import type { SandboxPage } from "@/lib/types";

export async function GET() {
  await connection();

  const user = await getSessionUser();
  if (!user) {
    return jsonError(401, "Not signed in.", "unauthenticated");
  }

  const config = readControlPlaneConfig();
  if (!config) {
    const items = listSandboxes();
    const page: SandboxPage = {
      items,
      total: items.length,
      limit: Math.max(items.length, 1),
      offset: 0,
      source: "mock",
    };
    return NextResponse.json(page);
  }

  try {
    const page = await listControlPlaneSandboxes(config);
    const body: SandboxPage = {
      items: page.items,
      total: page.total,
      limit: Math.max(page.items.length, 1),
      offset: 0,
      source: "control-plane",
    };
    return NextResponse.json(body);
  } catch (cause) {
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_sandboxes_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}
