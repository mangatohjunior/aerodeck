import { connection, NextResponse } from "next/server";

import {
  jsonRouteControlPlaneError,
  requireEnrolledRouteIds,
} from "@/lib/console-route-path";
import { getControlPlaneRouteCertificate, readControlPlaneConfig } from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { ROUTE_CERTIFICATE_NOT_FOUND } from "@/lib/route-input";

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
    return jsonError(404, "Certificates stay on the mock API.", "not_found");
  }

  try {
    const certificate = await getControlPlaneRouteCertificate(
      config,
      gated.projectId,
      gated.routeId,
    );
    return NextResponse.json(certificate);
  } catch (cause) {
    return jsonRouteControlPlaneError(
      cause,
      "console_project_route_certificate_failed",
      ROUTE_CERTIFICATE_NOT_FOUND,
      { conflictKind: "certificate" },
    );
  }
}
