import { NextResponse } from "next/server";

export function jsonError(status: number, detail: string, code: string) {
  return NextResponse.json({ detail, code }, { status });
}
