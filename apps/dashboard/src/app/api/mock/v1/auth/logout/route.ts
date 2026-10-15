import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";

import { destroySession } from "@/lib/mock-store";
import { SESSION_COOKIE, clearSessionCookie } from "@/lib/session-cookie";

export async function POST() {
  await connection();

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    destroySession(token);
  }

  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response);
  return response;
}
