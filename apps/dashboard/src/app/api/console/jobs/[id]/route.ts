import { connection, NextResponse } from "next/server";

import {
  ControlPlaneError,
  getControlPlaneJob,
  isControlPlaneUuid,
  readControlPlaneConfig,
} from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
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
    return jsonError(404, "Jobs stay on the mock API.", "not_found");
  }

  const { id } = await context.params;
  if (!isControlPlaneUuid(id)) {
    return jsonError(400, "Job id must be a UUID.", "invalid_job_id");
  }

  try {
    const job = await getControlPlaneJob(config, id);
    return NextResponse.json(job);
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.status === 503) {
      return jsonError(503, "Job queue is unavailable.", "queue_unavailable");
    }
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_job_read_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}
