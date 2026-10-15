import { connection, NextResponse } from "next/server";

import { listSandboxes } from "@/lib/mock-store";

export async function GET() {
  await connection();
  return NextResponse.json(listSandboxes());
}
