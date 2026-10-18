import { connection, NextResponse } from "next/server";

import {
  getControlPlaneDeployment,
  isControlPlaneUuid,
  readControlPlaneConfig,
} from "@/lib/control-plane";
import { jsonControlPlaneError, jsonError } from "@/lib/mock-http";
import { requireSessionUser } from "@/lib/session";

export async function GET(
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
    return jsonError(404, "Deployments stay on the mock API.", "not_found");
  }

  const { id } = await context.params;
  if (!isControlPlaneUuid(id)) {
    return jsonError(400, "Deployment id must be a UUID.", "invalid_deployment_id");
  }

  try {
    const deployment = await getControlPlaneDeployment(config, id);
    return NextResponse.json(deployment);
  } catch (cause) {
    return jsonControlPlaneError(cause, "console_deployment_read_failed");
  }
}
