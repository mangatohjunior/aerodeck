import { connection, NextResponse } from "next/server";

import {
  ControlPlaneError,
  listControlPlaneProjects,
  readControlPlaneConfig,
} from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { listProjects } from "@/lib/mock-store";
import { getSessionUser } from "@/lib/session";
import type { ProjectPage } from "@/lib/types";

export async function GET() {
  await connection();

  const user = await getSessionUser();
  if (!user) {
    return jsonError(401, "Not signed in.", "unauthenticated");
  }

  const config = readControlPlaneConfig();
  if (!config) {
    const items = listProjects();
    const page: ProjectPage = {
      items,
      total: items.length,
      limit: Math.max(items.length, 1),
      offset: 0,
      source: "mock",
    };
    return NextResponse.json(page);
  }

  try {
    const page = await listControlPlaneProjects(config);
    const body: ProjectPage = { ...page, source: "control-plane" };
    return NextResponse.json(body);
  } catch (cause) {
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_projects_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}
