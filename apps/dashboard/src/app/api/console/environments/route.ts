import { connection, NextResponse } from "next/server";

import {
  ControlPlaneError,
  createControlPlaneEnvironment,
  isControlPlaneUuid,
  listControlPlaneEnvironments,
  readControlPlaneConfig,
} from "@/lib/control-plane";
import {
  DEFAULT_ENVIRONMENT_REGION,
  ENVIRONMENT_FIELDS_INVALID,
  ENVIRONMENT_KIND_INVALID,
  ENVIRONMENT_NAME_INVALID,
  ENVIRONMENT_PROJECT_NOT_FOUND,
  ENVIRONMENT_PROJECT_REQUIRED,
  ENVIRONMENT_REGION_INVALID,
  ENVIRONMENT_SLUG_INVALID,
  ENVIRONMENT_SLUG_TAKEN,
  isValidEnvironmentKind,
  isValidEnvironmentName,
  isValidEnvironmentRegion,
  isValidEnvironmentSlug,
} from "@/lib/environment-input";
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
    return jsonError(404, "Environments stay on the mock API.", "not_found");
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

export async function POST(request: Request) {
  await connection();

  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }

  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Environments stay on the mock API.", "not_found");
  }

  let payload: {
    project_id?: unknown;
    slug?: unknown;
    name?: unknown;
    kind?: unknown;
    region?: unknown;
  };
  try {
    payload = (await request.json()) as {
      project_id?: unknown;
      slug?: unknown;
      name?: unknown;
      kind?: unknown;
      region?: unknown;
    };
  } catch {
    return jsonError(400, "Request body must be JSON.", "invalid_json");
  }

  const projectId = typeof payload.project_id === "string" ? payload.project_id.trim() : "";
  if (projectId.length === 0) {
    return jsonError(400, ENVIRONMENT_PROJECT_REQUIRED, "missing_project");
  }
  if (!isControlPlaneUuid(projectId)) {
    return jsonError(400, ENVIRONMENT_PROJECT_REQUIRED, "invalid_project_id");
  }
  if (typeof payload.slug !== "string" || typeof payload.name !== "string" || typeof payload.kind !== "string") {
    return jsonError(400, "slug, name, and kind are required.", "missing_fields");
  }

  const slug = payload.slug.trim();
  const name = payload.name.trim();
  const kind = payload.kind.trim();
  const regionRaw =
    payload.region === undefined || payload.region === null
      ? DEFAULT_ENVIRONMENT_REGION
      : typeof payload.region === "string"
        ? payload.region.trim()
        : "";

  if (!isValidEnvironmentSlug(slug)) {
    return jsonError(400, ENVIRONMENT_SLUG_INVALID, "invalid_slug");
  }
  if (!isValidEnvironmentName(name)) {
    return jsonError(400, ENVIRONMENT_NAME_INVALID, "invalid_name");
  }
  if (!isValidEnvironmentKind(kind)) {
    return jsonError(400, ENVIRONMENT_KIND_INVALID, "invalid_kind");
  }
  if (!isValidEnvironmentRegion(regionRaw)) {
    return jsonError(400, ENVIRONMENT_REGION_INVALID, "invalid_region");
  }

  try {
    const environment = await createControlPlaneEnvironment(config, {
      projectId,
      slug,
      name,
      kind,
      region: regionRaw,
    });
    return NextResponse.json(environment, { status: 201 });
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.status === 404) {
      return jsonError(404, ENVIRONMENT_PROJECT_NOT_FOUND, "not_found");
    }
    if (cause instanceof ControlPlaneError && cause.status === 409) {
      return jsonError(409, ENVIRONMENT_SLUG_TAKEN, "slug_taken");
    }
    if (cause instanceof ControlPlaneError && cause.status === 422) {
      return jsonError(400, ENVIRONMENT_FIELDS_INVALID, "invalid_fields");
    }
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_environment_create_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}
