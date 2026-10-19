import { isValidProjectName, isValidProjectSlug, PROJECT_SLUG_INVALID } from "@/lib/project-input";

/** Matches control-plane `EnvironmentKind`. */
export const ENVIRONMENT_KINDS = ["dev", "staging", "prod"] as const;
export type EnvironmentKind = (typeof ENVIRONMENT_KINDS)[number];

/**
 * DigitalOcean region slugs matching control-plane `Region`
 * (`^[a-z]{3}[0-9]$`). Curated common DO regions; CP accepts any matching pattern.
 */
export const ENVIRONMENT_REGIONS = [
  "nyc3",
  "ams3",
  "fra1",
  "sfo3",
  "sgp1",
  "lon1",
  "tor1",
  "blr1",
  "syd1",
] as const;
export type EnvironmentRegion = (typeof ENVIRONMENT_REGIONS)[number];

export const DEFAULT_ENVIRONMENT_REGION: EnvironmentRegion = "nyc3";

/** Same pattern as control-plane `Region` (fixed 4-char DO slug). */
const REGION_PATTERN = /^[a-z]{3}[0-9]$/;

export const ENVIRONMENT_SLUG_INVALID = PROJECT_SLUG_INVALID;
export const ENVIRONMENT_NAME_INVALID = "Enter an environment name (1–120 characters).";
export const ENVIRONMENT_KIND_INVALID = "Select a kind: dev, staging, or prod.";
export const ENVIRONMENT_REGION_INVALID =
  "Use a DigitalOcean region like nyc3, ams3, or fra1.";
export const ENVIRONMENT_PROJECT_REQUIRED = "Select a project.";
export const ENVIRONMENT_PROJECT_ID_INVALID = "project_id must be a UUID.";
export const ENVIRONMENT_PROJECT_NOT_FOUND = "Project was not found.";
export const ENVIRONMENT_SLUG_TAKEN = "That slug is already taken in this project.";
/** Upstream 422 after local checks passed — do not assume which field failed. */
export const ENVIRONMENT_FIELDS_INVALID = "Environment fields failed validation.";

export function isValidEnvironmentSlug(slug: string): boolean {
  return isValidProjectSlug(slug);
}

export function isValidEnvironmentName(name: string): boolean {
  return isValidProjectName(name);
}

export function isValidEnvironmentKind(kind: string): kind is EnvironmentKind {
  return (ENVIRONMENT_KINDS as readonly string[]).includes(kind);
}

export function isValidEnvironmentRegion(region: string): boolean {
  return REGION_PATTERN.test(region);
}

export type EnvironmentCreateFields = {
  projectId: string;
  name: string;
  slug: string;
  kind: string;
  region: string;
};

export type EnvironmentCreateParsed = {
  projectId: string;
  name: string;
  slug: string;
  kind: EnvironmentKind;
  region: string;
};

export type EnvironmentCreateParseResult =
  | { ok: true; value: EnvironmentCreateParsed }
  | { ok: false; error: string };

/** Client/BFF-shared validation for environment create forms. */
export function parseEnvironmentCreateFields(
  input: EnvironmentCreateFields,
): EnvironmentCreateParseResult {
  const projectId = input.projectId.trim();
  if (projectId.length === 0) {
    return { ok: false, error: ENVIRONMENT_PROJECT_REQUIRED };
  }
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const kind = input.kind.trim();
  const region = input.region.trim();
  if (!isValidEnvironmentName(name)) {
    return { ok: false, error: ENVIRONMENT_NAME_INVALID };
  }
  if (!isValidEnvironmentSlug(slug)) {
    return { ok: false, error: ENVIRONMENT_SLUG_INVALID };
  }
  if (!isValidEnvironmentKind(kind)) {
    return { ok: false, error: ENVIRONMENT_KIND_INVALID };
  }
  if (!isValidEnvironmentRegion(region)) {
    return { ok: false, error: ENVIRONMENT_REGION_INVALID };
  }
  return { ok: true, value: { projectId, name, slug, kind, region } };
}
