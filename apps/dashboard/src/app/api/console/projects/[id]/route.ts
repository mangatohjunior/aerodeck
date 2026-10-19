import { connection, NextResponse } from "next/server";

import {
  ControlPlaneError,
  getControlPlaneProjectDetail,
  isControlPlaneUuid,
  readControlPlaneConfig,
} from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { getProject } from "@/lib/mock-store";
import { requireSessionUser } from "@/lib/session";
import type { ProjectDetail } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  await connection();

  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }

  const { id } = await context.params;
  const projectId = id.trim();
  if (projectId.length === 0) {
    return jsonError(404, "Project was not found.", "not_found");
  }

  const config = readControlPlaneConfig();
  if (!config) {
    const project = getProject(projectId);
    if (!project) {
      return jsonError(404, "Project was not found.", "not_found");
    }
    const body: ProjectDetail = {
      project,
      environments: [],
      source: "mock",
    };
    return NextResponse.json(body);
  }

  if (!isControlPlaneUuid(projectId)) {
    return jsonError(404, "Project was not found.", "not_found");
  }

  try {
    const detail = await getControlPlaneProjectDetail(config, projectId);
    const body: ProjectDetail = {
      project: detail.project,
      environments: detail.environments,
      source: "control-plane",
    };
    return NextResponse.json(body);
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.status === 404) {
      return jsonError(404, "Project was not found.", "not_found");
    }
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_project_detail_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}
