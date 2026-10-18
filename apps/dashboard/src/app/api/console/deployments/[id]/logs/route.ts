import { connection } from "next/server";

import {
  ControlPlaneError,
  isDeploymentLogId,
  openControlPlaneDeploymentLogs,
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
    return jsonError(404, "Deployment logs stay on the mock API.", "not_found");
  }

  const { id } = await context.params;
  if (!isDeploymentLogId(id)) {
    return jsonError(400, "Deployment id must be a UUID.", "invalid_deployment_id");
  }

  try {
    const body = await openControlPlaneDeploymentLogs(config, id);
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (cause) {
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_deployment_logs_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}
