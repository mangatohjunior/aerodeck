import { connection, NextResponse } from "next/server";

import { requireEnrolledEnvironmentIds } from "@/lib/console-environment-route";
import { readControlPlaneConfig, reconcileControlPlaneEnvironment } from "@/lib/control-plane";
import { jsonControlPlaneError, jsonError } from "@/lib/mock-http";

type RouteContext = {
  params: Promise<{ id: string; environmentId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  await connection();

  const gated = await requireEnrolledEnvironmentIds(context);
  if (gated instanceof NextResponse) {
    return gated;
  }

  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Reconcile stays on the mock API.", "not_found");
  }

  try {
    const accepted = await reconcileControlPlaneEnvironment(
      config,
      gated.projectId,
      gated.environmentId,
    );
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
    return jsonControlPlaneError(
      cause,
      "console_environment_reconcile_failed",
      "Environment was not found.",
      "Job queue is unavailable.",
    );
  }
}
