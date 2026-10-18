import { connection, NextResponse } from "next/server";

import {
  ControlPlaneError,
  getControlPlaneDeployment,
  isDeploymentLogId,
  readControlPlaneConfig,
} from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { getSessionUser } from "@/lib/session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();

  const user = await getSessionUser();
  if (!user) {
    return jsonError(401, "Not signed in.", "unauthenticated");
  }

  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Deployments stay on the mock API.", "not_found");
  }

  const { id } = await context.params;
  if (!isDeploymentLogId(id)) {
    return jsonError(400, "Deployment id must be a UUID.", "invalid_deployment_id");
  }

  try {
    const deployment = await getControlPlaneDeployment(config, id);
    return NextResponse.json(deployment);
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.message.includes("not found (404)")) {
      return jsonError(404, "Deployment not found.", "not_found");
    }
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_deployment_read_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}
