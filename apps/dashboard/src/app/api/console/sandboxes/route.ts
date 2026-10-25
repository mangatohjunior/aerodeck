import { connection, NextResponse } from "next/server";

import { readJsonObject } from "@/lib/console-json-body";
import { jsonSandboxControlPlaneError } from "@/lib/console-sandbox-route";
import {
  ControlPlaneError,
  createControlPlaneSandbox,
  listControlPlaneSandboxes,
  readControlPlaneConfig,
} from "@/lib/control-plane";
import { jsonError } from "@/lib/mock-http";
import { listSandboxes } from "@/lib/mock-store";
import { parseSandboxCreateFields } from "@/lib/sandbox-input";
import { requireSessionUser } from "@/lib/session";
import type { SandboxPage } from "@/lib/types";

export async function GET() {
  await connection();

  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }

  const config = readControlPlaneConfig();
  if (!config) {
    const items = listSandboxes();
    const page: SandboxPage = {
      items,
      total: items.length,
      limit: Math.max(items.length, 1),
      offset: 0,
      source: "mock",
    };
    return NextResponse.json(page);
  }

  try {
    const page = await listControlPlaneSandboxes(config);
    const body: SandboxPage = {
      items: page.items,
      total: page.total,
      limit: Math.max(page.items.length, 1),
      offset: 0,
      source: "control-plane",
    };
    return NextResponse.json(body);
  } catch (cause) {
    const detail = cause instanceof ControlPlaneError ? cause.message : "request failed";
    console.error("event=console_sandboxes_failed detail=%s", detail);
    return jsonError(502, "Control plane request failed.", "control_plane_unavailable");
  }
}

function readOptionalNumberOrString(
  payload: Record<string, unknown>,
  key: string,
  code: string,
): { ok: true; value?: string | number } | { ok: false; response: NextResponse } {
  const raw = payload[key];
  if (raw === undefined || raw === null) {
    return { ok: true };
  }
  if (typeof raw !== "number" && typeof raw !== "string") {
    return { ok: false, response: jsonError(400, `${key} must be an integer.`, code) };
  }
  return { ok: true, value: raw };
}

export async function POST(request: Request) {
  await connection();

  const user = await requireSessionUser();
  if (user instanceof NextResponse) {
    return user;
  }

  const config = readControlPlaneConfig();
  if (!config) {
    return jsonError(404, "Sandboxes stay on the mock API.", "not_found");
  }

  const body = await readJsonObject(request);
  if (!body.ok) {
    return body.response;
  }

  const payload = body.value;
  if (typeof payload.project_id !== "string" || typeof payload.image !== "string") {
    return jsonError(400, "project_id and image are required.", "missing_fields");
  }

  const vcpu = readOptionalNumberOrString(payload, "vcpu", "invalid_vcpu");
  if (!vcpu.ok) {
    return vcpu.response;
  }
  const memoryMib = readOptionalNumberOrString(payload, "memory_mib", "invalid_memory_mib");
  if (!memoryMib.ok) {
    return memoryMib.response;
  }
  const ttlSeconds = readOptionalNumberOrString(payload, "ttl_seconds", "invalid_ttl_seconds");
  if (!ttlSeconds.ok) {
    return ttlSeconds.response;
  }

  const parsed = parseSandboxCreateFields({
    projectId: payload.project_id,
    image: payload.image,
    vcpu: vcpu.value,
    memoryMib: memoryMib.value,
    ttlSeconds: ttlSeconds.value,
  });
  if (!parsed.ok) {
    return jsonError(400, parsed.error, parsed.code);
  }

  try {
    const sandbox = await createControlPlaneSandbox(config, parsed.value);
    return NextResponse.json(sandbox, { status: 201 });
  } catch (cause) {
    return jsonSandboxControlPlaneError(cause, "console_sandbox_create_failed");
  }
}
