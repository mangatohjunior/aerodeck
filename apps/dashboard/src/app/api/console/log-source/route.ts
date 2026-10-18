import { connection, NextResponse } from "next/server";

import { readControlPlaneConfig } from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { getSessionUser } from "@/lib/session";
import type { ProjectSource } from "@/lib/types";

export async function GET() {
  await connection();

  const user = await getSessionUser();
  if (!user) {
    return jsonError(401, "Not signed in.", "unauthenticated");
  }

  const source: ProjectSource = readControlPlaneConfig() ? "control-plane" : "mock";
  return NextResponse.json({ source });
}
