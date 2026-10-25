import { connection, NextResponse } from "next/server";

import {
  jsonRouteControlPlaneError,
  requireEnrolledRouteIds,
} from "@/lib/console-route-path";
import { getControlPlaneRouteDns, readControlPlaneConfig } from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { ROUTE_DNS_NOT_FOUND } from "@/lib/route-input";

type RouteContext = {
  params: Promise<{ id: string; routeId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  await connection();

  const gated = await requireEnrolledRouteIds(context);
  if (gated instanceof NextResponse) {
    return gated;
  }

  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Routes stay on the mock API.", "not_found");
  }

  try {
    const record = await getControlPlaneRouteDns(config, gated.projectId, gated.routeId);
    return NextResponse.json(record);
  } catch (cause) {
    return jsonRouteControlPlaneError(
      cause,
      "console_project_route_dns_failed",
      ROUTE_DNS_NOT_FOUND,
    );
  }
}

