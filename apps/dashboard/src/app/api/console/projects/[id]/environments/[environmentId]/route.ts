import { connection, NextResponse } from "next/server";

import { requireEnrolledEnvironmentIds } from "@/lib/console-environment-route";
import { readJsonObject, readOptionalString } from "@/lib/console-json-body";
import {
  ControlPlaneError,
  deleteControlPlaneEnvironment,
  readControlPlaneConfig,
  updateControlPlaneEnvironment,
} from "@/lib/control-plane";
import {
  ENVIRONMENT_FIELDS_INVALID,
  parseEnvironmentUpdateFields,
} from "@/lib/environment-input";
import { jsonError } from "@/lib/mock-http";

type RouteContext = {
  params: Promise<{ id: string; environmentId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  await connection();

  const gated = await requireEnrolledEnvironmentIds(context);
  if (gated instanceof NextResponse) {
    return gated;
  }
  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Environments stay on the mock API.", "not_found");
  }

  const body = await readJsonObject(request);
  if (!body.ok) {
    return body.response;
  }

  const fields: { name?: string; kind?: string; region?: string } = {};
  for (const [key, code] of [
    ["name", "invalid_name"],
    ["kind", "invalid_kind"],
    ["region", "invalid_region"],
  ] as const) {
    const field = readOptionalString(body.value, key, code);
    if (!field.ok) {
      return field.response;
    }
    if (field.value !== undefined) {
      fields[key] = field.value;
    }
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

  const gated = await requireEnrolledEnvironmentIds(context);
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
