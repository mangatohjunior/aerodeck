import { connection, NextResponse } from "next/server";

import {
  failControlPlaneDeployment,
  isControlPlaneUuid,
  readControlPlaneConfig,
  succeedControlPlaneDeployment,
} from "@/lib/control-plane";
import { jsonControlPlaneError, jsonError } from "@/lib/mock-http";
import { requireSessionUser } from "@/lib/session";

/** Shared POST handler for `/api/console/deployments/{id}/succeeded|failed`. */
export async function recordConsoleDeploymentOutcome(
  context: { params: Promise<{ id: string }> },
  outcome: "succeeded" | "failed",
): Promise<NextResponse> {
  await connection();

  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }

  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Deployment status stays on the mock API.", "not_found");
  }

  const { id } = await context.params;
  if (!isControlPlaneUuid(id)) {
    return jsonError(400, "Deployment id must be a UUID.", "invalid_deployment_id");
  }

  const event =
    outcome === "succeeded"
      ? "console_deployment_succeeded_failed"
      : "console_deployment_failed_status";
  try {
    const mark =
      outcome === "succeeded" ? succeedControlPlaneDeployment : failControlPlaneDeployment;
    const deployment = await mark(config, id);
    return NextResponse.json(deployment);
  } catch (cause) {
    return jsonControlPlaneError(cause, event);
  }
}
