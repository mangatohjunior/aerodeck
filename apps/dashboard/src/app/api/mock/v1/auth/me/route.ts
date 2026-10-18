import { connection, NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/session";

export async function GET() {
  await connection();

  const session = await requireSessionUser();
  if (session instanceof NextResponse) {
    return session;
  }
  return NextResponse.json(session);
}
