import { NextResponse } from "next/server";

import { ControlPlaneError } from "@/lib/control-plane";

export function jsonError(status: number, detail: string, code: string) {
  return NextResponse.json({ detail, code }, { status });
}

/**
 * Map a control-plane failure to 404 when the row is missing, optional 503 when
 * `queueUnavailableDetail` is set (job queue), otherwise 502.
 */
export function jsonControlPlaneError(
  cause: unknown,
  event: string,
  notFoundDetail = "Deployment not found.",
  queueUnavailableDetail?: string,
): NextResponse {
  if (cause instanceof ControlPlaneError && cause.status === 404) {
    return jsonError(404, notFoundDetail, "not_found");
  }
  if (
    queueUnavailableDetail !== undefined &&
    cause instanceof ControlPlaneError &&
    cause.status === 503
  ) {
    return jsonError(503, queueUnavailableDetail, "queue_unavailable");
  }
  const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
  console.error(`event=${event} detail=%s`, detail);
  return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
}
