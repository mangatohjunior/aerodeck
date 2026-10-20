import { NextResponse } from "next/server";

import { isControlPlaneUuid } from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { requireSessionUser } from "@/lib/session";

type EnvironmentRouteContext = {
  params: Promise<{ id: string; environmentId: string }>;
};

/**
 * Session gate + UUID project/environment ids for console environment routes
 * (PATCH/DELETE/reconcile).
 */
export async function requireEnrolledEnvironmentIds(
  context: EnvironmentRouteContext,
): Promise<{ projectId: string; environmentId: string } | NextResponse> {
  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }
  const { id, environmentId: rawEnvironmentId } = await context.params;
  const projectId = id.trim();
  const environmentId = rawEnvironmentId.trim();
  if (
    projectId.length === 0 ||
    environmentId.length === 0 ||
    !isControlPlaneUuid(projectId) ||
    !isControlPlaneUuid(environmentId)
  ) {
    return jsonError(404, "Environment was not found.", "not_found");
  }
  return { projectId, environmentId };
}
