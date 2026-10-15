import type { AuthErrorCode } from "@/lib/types";

export const MIN_PASSWORD_LENGTH = 8;

export class MockAuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, detail: string) {
    super(detail);
    this.name = "MockAuthError";
    this.code = code;
  }
}

export function isMockAuthError(cause: unknown): cause is MockAuthError {
  return cause instanceof Error && "code" in cause && typeof cause.code === "string";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function isStrongPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

export const INVALID_CREDENTIALS_DETAIL = "Invalid email or password.";
