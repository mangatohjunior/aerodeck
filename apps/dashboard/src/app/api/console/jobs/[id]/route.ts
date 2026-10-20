import { connection, NextResponse } from "next/server";

import {
  getControlPlaneJob,
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
    return jsonError(404, "Jobs stay on the mock API.", "not_found");
  }

  const { id } = await context.params;
  if (!isControlPlaneUuid(id)) {
    return jsonError(400, "Job id must be a UUID.", "invalid_job_id");
  }

  try {
    const job = await getControlPlaneJob(config, id);
    // Console only needs status/error for the detail panel — omit structured result.
    return NextResponse.json({
      job_id: job.job_id,
      status: job.status,
      error: job.error ?? null,
    });
  } catch (cause) {
    return jsonControlPlaneError(
      cause,
      "console_job_read_failed",
      "Job not found.",
      "Job queue is unavailable.",
    );
  }
}
