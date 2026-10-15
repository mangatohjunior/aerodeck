import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";

import { jsonError } from "@/lib/mock-http";
import { getUserBySessionToken } from "@/lib/mock-store";
import { SESSION_COOKIE } from "@/lib/session-cookie";

export async function GET() {
  await connection();

  const user = getUserBySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) {
    return jsonError(401, "Not signed in.", "unauthenticated");
  }

  return NextResponse.json(user);
}
