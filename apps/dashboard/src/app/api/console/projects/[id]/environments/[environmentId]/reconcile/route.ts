import { connection, NextResponse } from "next/server";

import {
  ControlPlaneError,
  isControlPlaneUuid,
  readControlPlaneConfig,
  reconcileControlPlaneEnvironment,
} from "@/lib/control-plane";
import { jsonControlPlaneError, jsonError } from "@/lib/mock-http";
import { requireSessionUser } from "@/lib/session";

type RouteContext = {
  params: Promise<{ id: string; environmentId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  await connection();

  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }

  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Reconcile stays on the mock API.", "not_found");
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

  try {
    const accepted = await reconcileControlPlaneEnvironment(config, projectId, environmentId);
    return NextResponse.json(
      {
        job_id: accepted.job_id,
        kind: accepted.kind,
        project_id: accepted.project_id,
        environment_id: accepted.environment_id,
        status: accepted.status,
      },
      { status: 202 },
    );
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.status === 404) {
      return jsonError(404, "Environment was not found.", "not_found");
    }
    return jsonControlPlaneError(
      cause,
      "console_environment_reconcile_failed",
      "Environment was not found.",
      "Job queue is unavailable.",
    );
  }
}
