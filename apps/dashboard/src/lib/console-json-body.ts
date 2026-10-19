import { NextResponse } from "next/server";

import { jsonError } from "@/lib/mock-http";

export type JsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: NextResponse };

export type OptionalStringResult =
  | { ok: true; value?: string }
  | { ok: false; response: NextResponse };

export type OptionalNullableStringResult =
  | { ok: true; value?: string | null }
  | { ok: false; response: NextResponse };

/** Parse a JSON object body; rejects null, arrays, and non-objects with 400. */
export async function readJsonObject(request: Request): Promise<JsonObjectResult> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: jsonError(400, "Request body must be JSON.", "invalid_json") };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, response: jsonError(400, "Request body must be JSON.", "invalid_json") };
  }
  return { ok: true, value: raw as Record<string, unknown> };
}

/** Read an optional string field; missing stays undefined, wrong type → 400. */
export function readOptionalString(
  payload: Record<string, unknown>,
  key: string,
  code: string,
): OptionalStringResult {
  if (payload[key] === undefined) {
    return { ok: true };
  }
  if (typeof payload[key] !== "string") {
    return { ok: false, response: jsonError(400, `${key} must be a string.`, code) };
  }
  return { ok: true, value: payload[key] };
}

/** Like readOptionalString but also allows null (e.g. project description clear). */
export function readOptionalNullableString(
  payload: Record<string, unknown>,
  key: string,
  code: string,
): OptionalNullableStringResult {
  if (payload[key] === undefined) {
    return { ok: true };
  }
  if (payload[key] !== null && typeof payload[key] !== "string") {
    return { ok: false, response: jsonError(400, `${key} must be a string.`, code) };
  }
  return { ok: true, value: payload[key] as string | null };
}
