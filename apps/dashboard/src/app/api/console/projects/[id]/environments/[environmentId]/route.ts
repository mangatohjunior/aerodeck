import { connection, NextResponse } from "next/server";

import {
  ControlPlaneError,
  deleteControlPlaneEnvironment,
  isControlPlaneUuid,
  readControlPlaneConfig,
  updateControlPlaneEnvironment,
} from "@/lib/control-plane";
import {
  ENVIRONMENT_FIELDS_INVALID,
  parseEnvironmentUpdateFields,
} from "@/lib/environment-input";
import { jsonError } from "@/lib/mock-http";
import { requireSessionUser } from "@/lib/session";

type RouteContext = {
  params: Promise<{ id: string; environmentId: string }>;
};

async function requireEnrolledIds(
  context: RouteContext,
): Promise<{ projectId: string; environmentId: string } | NextResponse> {
  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }
  const { id, environmentId: rawEnvironmentId } = await context.params;
  const projectId = id.trim();
  const environmentId = rawEnvironmentId.trim();
  if (
    projectId.length === 0 ||
    environmentId.length === 0 ||
    !isControlPlaneUuid(projectId) ||
    !isControlPlaneUuid(environmentId)
  ) {
    return jsonError(404, "Environment was not found.", "not_found");
  }
  return { projectId, environmentId };
}

export async function PATCH(request: Request, context: RouteContext) {
  await connection();

  const gated = await requireEnrolledIds(context);
  if (gated instanceof NextResponse) {
    return gated;
  }
  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Environments stay on the mock API.", "not_found");
  }

  let payload: { name?: unknown; kind?: unknown; region?: unknown };
  try {
    payload = (await request.json()) as { name?: unknown; kind?: unknown; region?: unknown };
  } catch {
    return jsonError(400, "Request body must be JSON.", "invalid_json");
  }

  const fields: { name?: string; kind?: string; region?: string } = {};
  if (payload.name !== undefined) {
    if (typeof payload.name !== "string") {
      return jsonError(400, "name must be a string.", "invalid_name");
    }
    fields.name = payload.name;
  }
  if (payload.kind !== undefined) {
    if (typeof payload.kind !== "string") {
      return jsonError(400, "kind must be a string.", "invalid_kind");
    }
    fields.kind = payload.kind;
  }
  if (payload.region !== undefined) {
    if (typeof payload.region !== "string") {
      return jsonError(400, "region must be a string.", "invalid_region");
    }
    fields.region = payload.region;
  }

  const parsed = parseEnvironmentUpdateFields(fields);
  if (!parsed.ok) {
    return jsonError(400, parsed.error, parsed.code);
  }

  try {
    const environment = await updateControlPlaneEnvironment(config, {
      projectId: gated.projectId,
      environmentId: gated.environmentId,
      ...parsed.value,
    });
    return NextResponse.json(environment);
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.status === 404) {
      return jsonError(404, "Environment was not found.", "not_found");
    }
    if (cause instanceof ControlPlaneError && cause.status === 422) {
      return jsonError(400, ENVIRONMENT_FIELDS_INVALID, "invalid_fields");
    }
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_environment_update_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  await connection();

  const gated = await requireEnrolledIds(context);
  if (gated instanceof NextResponse) {
    return gated;
  }
  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Environments stay on the mock API.", "not_found");
  }

  try {
    await deleteControlPlaneEnvironment(config, gated.projectId, gated.environmentId);
    return new NextResponse(null, { status: 204 });
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.status === 404) {
      return jsonError(404, "Environment was not found.", "not_found");
    }
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_environment_delete_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}
