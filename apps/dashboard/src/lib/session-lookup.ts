import { ControlPlaneError, type ControlPlaneConfig } from "@/lib/control-plane";
import type { PublicUser } from "@/lib/types";

export type SessionRead =
  | { status: "user"; user: PublicUser }
  | { status: "anonymous" }
  | { status: "unavailable" };

export type SessionLookup = {
  token?: string;
  config: ControlPlaneConfig | null;
  mockUser?: PublicUser;
  resolve?: (token: string) => Promise<PublicUser>;
};

export function isMissingControlPlaneSession(cause: ControlPlaneError): boolean {
  return cause.message.includes("not found (404)");
}

/** Revoke only a control-plane cookie. A mock-store token stays local. */
export function shouldRevokeControlPlaneSession(
  token: string | undefined,
  config: ControlPlaneConfig | null,
  mockUser: PublicUser | undefined,
): boolean {
  return Boolean(token && config && !mockUser);
}

export async function lookupSession(lookup: SessionLookup): Promise<SessionRead> {
  if (!lookup.token) {
    return { status: "anonymous" };
  }
  if (lookup.mockUser) {
    return { status: "user", user: lookup.mockUser };
  }
  if (!lookup.config || !lookup.resolve) {
    return { status: "anonymous" };
  }
  try {
    return { status: "user", user: await lookup.resolve(lookup.token) };
  } catch (cause) {
    if (!(cause instanceof ControlPlaneError)) {
      throw cause;
    }
    if (isMissingControlPlaneSession(cause)) {
      return { status: "anonymous" };
    }
    console.error("event=console_session_failed detail=%s", cause.message);
    return { status: "unavailable" };
  }
}
