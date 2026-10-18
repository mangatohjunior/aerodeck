import { connection, NextResponse } from "next/server";

import { readControlPlaneConfig } from "@/lib/control-plane";
import { requireSessionUser } from "@/lib/session";
import type { ProjectSource } from "@/lib/types";

export async function GET() {
  await connection();

  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }

  const source: ProjectSource = readControlPlaneConfig() ? "control-plane" : "mock";
  return NextResponse.json({ source });
}
