import { connection, NextResponse } from "next/server";

import { listProjects } from "@/lib/mock-store";

export async function GET() {
  await connection();
  return NextResponse.json(listProjects());
}
