import { isControlPlaneUuid } from "@/lib/control-plane-uuid";
import type { Sandbox } from "@/lib/types";

export const SANDBOX_IMAGE_MAX = 64;
export const SANDBOX_VCPU_MIN = 1;
export const SANDBOX_VCPU_MAX = 8;
export const SANDBOX_MEMORY_MIB_MIN = 32;
export const SANDBOX_MEMORY_MIB_MAX = 4096;
export const SANDBOX_TTL_SECONDS_MIN = 30;
export const SANDBOX_TTL_SECONDS_MAX = 86_400;

export const DEFAULT_SANDBOX_IMAGE = "alpine-3.20";
export const DEFAULT_SANDBOX_VCPU = 1;
export const DEFAULT_SANDBOX_MEMORY_MIB = 128;
export const DEFAULT_SANDBOX_TTL_SECONDS = 3600;

/** Matches control-plane `ImageName` (`^[a-z0-9][a-z0-9._-]*$`, no path separators). */
const SANDBOX_IMAGE_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export const SANDBOX_PROJECT_REQUIRED = "Select a project.";
export const SANDBOX_PROJECT_ID_INVALID = "project_id must be a UUID.";
export const SANDBOX_PROJECT_NOT_FOUND = "Project was not found.";
export const SANDBOX_IMAGE_INVALID =
  "Use a declared guest image name like alpine-3.20 (lowercase letters, digits, ., _, -).";
export const SANDBOX_VCPU_INVALID = "vCPU must be an integer between 1 and 8.";
export const SANDBOX_MEMORY_INVALID = "Memory must be an integer between 32 and 4096 MiB.";
export const SANDBOX_TTL_INVALID = "TTL must be an integer between 30 and 86400 seconds.";
export const SANDBOX_FIELDS_INVALID = "Sandbox fields failed validation.";
export const SANDBOX_HOST_UNAVAILABLE =
  "No enrolled Firecracker sandbox host is available.";
export const SANDBOX_BOOT_FAILED = "Hypervisor failed to boot the sandbox microVM.";

export function isValidSandboxImage(image: string): boolean {
  return (
    image.length >= 1 &&
    image.length <= SANDBOX_IMAGE_MAX &&
    SANDBOX_IMAGE_PATTERN.test(image)
  );
}

function parseBoundedInteger(
  raw: string | number | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number | null {
  if (raw === undefined) {
    return defaultValue;
  }
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw >= min && raw <= max ? raw : null;
  }
  const trimmed = raw.trim();
  if (!/^[0-9]{1,6}$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

export type SandboxCreateFields = {
  projectId: string;
  image: string;
  vcpu?: string | number;
  memoryMib?: string | number;
  ttlSeconds?: string | number;
};

export type SandboxCreateParsed = {
  projectId: string;
  image: string;
  vcpu: number;
  memoryMib: number;
  ttlSeconds: number;
};

export type SandboxCreateParseResult =
  | { ok: true; value: SandboxCreateParsed }
  | { ok: false; error: string; code: string };

/** Client/BFF-shared validation for sandbox creation. */
export function parseSandboxCreateFields(
  input: SandboxCreateFields,
): SandboxCreateParseResult {
  const projectId = input.projectId.trim();
  if (projectId.length === 0) {
    return { ok: false, error: SANDBOX_PROJECT_REQUIRED, code: "missing_project" };
  }
  if (!isControlPlaneUuid(projectId)) {
    return { ok: false, error: SANDBOX_PROJECT_ID_INVALID, code: "invalid_project_id" };
  }
  const image = input.image.trim().toLowerCase();
  if (!isValidSandboxImage(image)) {
    return { ok: false, error: SANDBOX_IMAGE_INVALID, code: "invalid_image" };
  }
  const vcpu = parseBoundedInteger(
    input.vcpu,
    DEFAULT_SANDBOX_VCPU,
    SANDBOX_VCPU_MIN,
    SANDBOX_VCPU_MAX,
  );
  if (vcpu === null) {
    return { ok: false, error: SANDBOX_VCPU_INVALID, code: "invalid_vcpu" };
  }
  const memoryMib = parseBoundedInteger(
    input.memoryMib,
    DEFAULT_SANDBOX_MEMORY_MIB,
    SANDBOX_MEMORY_MIB_MIN,
    SANDBOX_MEMORY_MIB_MAX,
  );
  if (memoryMib === null) {
    return { ok: false, error: SANDBOX_MEMORY_INVALID, code: "invalid_memory_mib" };
  }
  const ttlSeconds = parseBoundedInteger(
    input.ttlSeconds,
    DEFAULT_SANDBOX_TTL_SECONDS,
    SANDBOX_TTL_SECONDS_MIN,
    SANDBOX_TTL_SECONDS_MAX,
  );
  if (ttlSeconds === null) {
    return { ok: false, error: SANDBOX_TTL_INVALID, code: "invalid_ttl_seconds" };
  }
  return {
    ok: true,
    value: { projectId, image, vcpu, memoryMib, ttlSeconds },
  };
}

/** Merge newly created sandboxes at the front while deduplicating by id. */
export function mergeSandboxesById(
  incoming: readonly Sandbox[],
  current: readonly Sandbox[],
): Sandbox[] {
  const seen = new Set<string>();
  const merged: Sandbox[] = [];
  for (const row of [...incoming, ...current]) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}
