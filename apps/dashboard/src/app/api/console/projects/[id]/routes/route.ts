import { connection, NextResponse } from "next/server";

import { readJsonObject, readOptionalString } from "@/lib/console-json-body";
import {
  jsonRouteControlPlaneError,
  requireEnrolledProjectRouteId,
} from "@/lib/console-route-path";
import { createControlPlaneRoute, readControlPlaneConfig } from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { parseRouteCreateFields, ROUTE_TARGET_NOT_FOUND } from "@/lib/route-input";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  await connection();

  const gated = await requireEnrolledProjectRouteId(context);
  if (gated instanceof NextResponse) {
    return gated;
  }

  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Routes stay on the mock API.", "not_found");
  }

  const body = await readJsonObject(request);
  if (!body.ok) {
    return body.response;
  }

  const payload = body.value;
  if (
    typeof payload.environment_id !== "string" ||
    typeof payload.hostname !== "string" ||
    typeof payload.backend_host !== "string" ||
    (typeof payload.backend_port !== "number" && typeof payload.backend_port !== "string")
  ) {
    return jsonError(
      400,
      "environment_id, hostname, backend_host, and backend_port are required.",
      "missing_fields",
    );
  }

  const pathPrefix = readOptionalString(payload, "path_prefix", "invalid_path_prefix");
  if (!pathPrefix.ok) {
    return pathPrefix.response;
  }

  const parsed = parseRouteCreateFields({
    projectId: gated.projectId,
    environmentId: payload.environment_id,
    hostname: payload.hostname,
    backendHost: payload.backend_host,
    backendPort: payload.backend_port,
    pathPrefix: pathPrefix.value,
  });
  if (!parsed.ok) {
    return jsonError(400, parsed.error, parsed.code);
  }

  try {
    const route = await createControlPlaneRoute(config, parsed.value);
    return NextResponse.json(route, { status: 201 });
  } catch (cause) {
    return jsonRouteControlPlaneError(
      cause,
      "console_project_route_create_failed",
      ROUTE_TARGET_NOT_FOUND,
    );
  }
}

