import { NextResponse } from "next/server";

import { ControlPlaneError, isControlPlaneUuid } from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import {
  ROUTE_DNS_FAILED,
  ROUTE_DNS_UNAVAILABLE,
  ROUTE_FIELDS_INVALID,
  ROUTE_HOSTNAME_TAKEN,
} from "@/lib/route-input";
import { requireSessionUser } from "@/lib/session";

type ProjectRouteContext = {
  params: Promise<{ id: string }>;
};

type RouteItemContext = {
  params: Promise<{ id: string; routeId: string }>;
};

/** Session gate + UUID project id for project route collection handlers. */
export async function requireEnrolledProjectRouteId(
  context: ProjectRouteContext,
): Promise<{ projectId: string } | NextResponse> {
  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }
  const { id } = await context.params;
  const projectId = id.trim();
  if (projectId.length === 0 || !isControlPlaneUuid(projectId)) {
    return jsonError(404, "Project was not found.", "not_found");
  }
  return { projectId };
}

/** Session gate + UUID project/route ids for route sub-resource handlers (DNS, certificate). */
export async function requireEnrolledRouteIds(
  context: RouteItemContext,
): Promise<{ projectId: string; routeId: string } | NextResponse> {
  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }
  const { id, routeId: rawRouteId } = await context.params;
  const projectId = id.trim();
  const routeId = rawRouteId.trim();
  if (
    projectId.length === 0 ||
    routeId.length === 0 ||
    !isControlPlaneUuid(projectId) ||
    !isControlPlaneUuid(routeId)
  ) {
    return jsonError(404, "Route was not found.", "not_found");
  }
  return { projectId, routeId };
}

/** Map control-plane route and DNS failures to BFF JSON responses. */
export function jsonRouteControlPlaneError(
  cause: unknown,
  event: string,
  notFoundDetail: string,
): NextResponse {
  if (cause instanceof ControlPlaneError) {
    if (cause.status === 404) {
      return jsonError(404, notFoundDetail, "not_found");
    }
    if (cause.status === 409) {
      return jsonError(409, ROUTE_HOSTNAME_TAKEN, "hostname_taken");
    }
    if (cause.status === 422) {
      return jsonError(400, ROUTE_FIELDS_INVALID, "invalid_fields");
    }
    if (cause.status === 503 || cause.code === "dns_record_unavailable") {
      return jsonError(503, ROUTE_DNS_UNAVAILABLE, "dns_unavailable");
    }
    if (cause.status === 502 && cause.code === "dns_record_failed") {
      return jsonError(502, ROUTE_DNS_FAILED, "dns_record_failed");
    }
  }
  const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
  console.error(`event=${event} detail=%s`, detail);
  return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
}

