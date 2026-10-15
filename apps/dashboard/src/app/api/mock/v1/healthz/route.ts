import { connection, NextResponse } from "next/server";

export async function GET() {
  await connection();
  return NextResponse.json({
    status: "ok",
    service: "aerodeck-dashboard-mock",
    mode: "mock",
    version: "0.1.0",
  });
}
