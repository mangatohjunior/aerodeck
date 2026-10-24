import { connection, NextResponse } from "next/server";

import {
  readJsonObject,
  readOptionalNullableString,
  readOptionalString,
} from "@/lib/console-json-body";
import {
  ControlPlaneError,
  deleteControlPlaneProject,
  getControlPlaneProjectDetail,
  isControlPlaneUuid,
  readControlPlaneConfig,
  updateControlPlaneProject,
} from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { getProject } from "@/lib/mock-store";
import {
  parseProjectUpdateFields,
  PROJECT_FIELDS_INVALID,
} from "@/lib/project-input";
import { requireSessionUser } from "@/lib/session";
import type { ProjectDetail } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function requireEnrolledProjectId(
  context: RouteContext,
): Promise<{ projectId: string } | NextResponse> {
  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }
  const { id } = await context.params;
  const projectId = id.trim();
  if (projectId.length === 0 || !isControlPlaneUuid(projectId)) {
    return jsonError(404, "Project was not found.", "not_found");
  }
  return { projectId };
}

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
      routes: [],
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
      routes: detail.routes,
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

export async function PATCH(request: Request, context: RouteContext) {
  await connection();

  const gated = await requireEnrolledProjectId(context);
  if (gated instanceof NextResponse) {
    return gated;
  }
  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Projects stay on the mock API.", "not_found");
  }

  const body = await readJsonObject(request);
  if (!body.ok) {
    return body.response;
  }

  const fields: { name?: string; description?: string | null } = {};
  const name = readOptionalString(body.value, "name", "invalid_name");
  if (!name.ok) {
    return name.response;
  }
  if (name.value !== undefined) {
    fields.name = name.value;
  }
  const description = readOptionalNullableString(body.value, "description", "invalid_description");
  if (!description.ok) {
    return description.response;
  }
  if (description.value !== undefined) {
    fields.description = description.value;
  }

  const parsed = parseProjectUpdateFields(fields);
  if (!parsed.ok) {
    return jsonError(400, parsed.error, parsed.code);
  }

  try {
    const project = await updateControlPlaneProject(config, {
      projectId: gated.projectId,
      ...parsed.value,
    });
    return NextResponse.json(project);
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.status === 404) {
      return jsonError(404, "Project was not found.", "not_found");
    }
    if (cause instanceof ControlPlaneError && cause.status === 422) {
      return jsonError(400, PROJECT_FIELDS_INVALID, "invalid_fields");
    }
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_project_update_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  await connection();

  const gated = await requireEnrolledProjectId(context);
  if (gated instanceof NextResponse) {
    return gated;
  }
  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Projects stay on the mock API.", "not_found");
  }

  try {
    await deleteControlPlaneProject(config, gated.projectId);
    return new NextResponse(null, { status: 204 });
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.status === 404) {
      return jsonError(404, "Project was not found.", "not_found");
    }
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_project_delete_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}
