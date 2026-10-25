import { NextResponse } from "next/server";

import { ControlPlaneError } from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import {
  SANDBOX_BOOT_FAILED,
  SANDBOX_FIELDS_INVALID,
  SANDBOX_HOST_UNAVAILABLE,
  SANDBOX_PROJECT_NOT_FOUND,
} from "@/lib/sandbox-input";

/** Map control-plane sandbox create failures to BFF JSON responses. */
export function jsonSandboxControlPlaneError(cause: unknown, event: string): NextResponse {
  if (cause instanceof ControlPlaneError) {
    if (cause.status === 404) {
      return jsonError(404, SANDBOX_PROJECT_NOT_FOUND, "not_found");
    }
    if (cause.status === 422) {
      return jsonError(400, SANDBOX_FIELDS_INVALID, "invalid_fields");
    }
    if (cause.status === 503 || cause.code === "sandbox_unavailable") {
      return jsonError(503, SANDBOX_HOST_UNAVAILABLE, "sandbox_unavailable");
    }
    if (cause.status === 502 && cause.code === "sandbox_failed") {
      return jsonError(502, SANDBOX_BOOT_FAILED, "sandbox_failed");
    }
  }
  const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
  console.error(`event=${event} detail=%s`, detail);
  return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
}
