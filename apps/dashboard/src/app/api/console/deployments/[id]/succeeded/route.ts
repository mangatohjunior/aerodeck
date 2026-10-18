import { connection, NextResponse } from "next/server";

import {
  isControlPlaneUuid,
  readControlPlaneConfig,
  succeedControlPlaneDeployment,
} from "@/lib/control-plane";
import { jsonControlPlaneError, jsonError } from "@/lib/mock-http";
import { requireSessionUser } from "@/lib/session";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  try {
    const deployment = await succeedControlPlaneDeployment(config, id);
    return NextResponse.json(deployment);
  } catch (cause) {
    return jsonControlPlaneError(cause, "console_deployment_succeeded_failed");
  }
}
