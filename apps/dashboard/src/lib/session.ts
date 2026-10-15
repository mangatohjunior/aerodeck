import { cookies } from "next/headers";

import { getUserBySessionToken } from "@/lib/mock-store";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import type { PublicUser } from "@/lib/types";

export async function getSessionUser(): Promise<PublicUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return getUserBySessionToken(token) ?? null;
}
