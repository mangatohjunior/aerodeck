/** Matches control-plane `Slug` in `app/schemas/common.py`. */
const PROJECT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const PROJECT_NAME_MAX = 120;
export const PROJECT_SLUG_MAX = 63;
export const PROJECT_DESCRIPTION_MAX = 1000;

export const PROJECT_SLUG_INVALID =
  "Use a lowercase slug with letters, digits, and hyphens (no leading or trailing hyphen).";
export const PROJECT_NAME_INVALID = "Enter a project name (1–120 characters).";
export const PROJECT_DESCRIPTION_TOO_LONG = "Description is too long.";
export const PROJECT_DESCRIPTION_INVALID_TYPE = "description must be a string.";
/** Upstream 422 after local checks passed — do not assume which field failed. */
export const PROJECT_FIELDS_INVALID = "Project fields failed validation.";
export const PROJECT_SLUG_TAKEN = "That slug is already taken.";

export function isValidProjectSlug(slug: string): boolean {
  return (
    slug.length >= 1 &&
    slug.length <= PROJECT_SLUG_MAX &&
    PROJECT_SLUG_PATTERN.test(slug)
  );
}

export function isValidProjectName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= PROJECT_NAME_MAX;
}

export function normalizeProjectDescription(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Lowercase slug suggestion from a display name; empty when nothing usable remains. */
export function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PROJECT_SLUG_MAX)
    .replace(/-+$/g, "");
}

export const PROJECT_UPDATE_EMPTY = "Change the name or description before saving.";

export type ProjectUpdateFields = {
  name?: string;
  description?: string | null;
};

export type ProjectUpdateParsed = {
  name?: string;
  description?: string | null;
};

export type ProjectUpdateParseResult =
  | { ok: true; value: ProjectUpdateParsed }
  | { ok: false; error: string; code: string };

export function parseProjectUpdateFields(input: ProjectUpdateFields): ProjectUpdateParseResult {
  const value: ProjectUpdateParsed = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!isValidProjectName(name)) {
      return { ok: false, error: PROJECT_NAME_INVALID, code: "invalid_name" };
    }
    value.name = name;
  }
  if (input.description !== undefined) {
    if (input.description !== null && typeof input.description !== "string") {
      return { ok: false, error: PROJECT_DESCRIPTION_INVALID_TYPE, code: "invalid_description" };
    }
    const description = normalizeProjectDescription(input.description);
    if (description !== null && description.length > PROJECT_DESCRIPTION_MAX) {
      return { ok: false, error: PROJECT_DESCRIPTION_TOO_LONG, code: "invalid_description" };
    }
    value.description = description;
  }
  if (value.name === undefined && value.description === undefined) {
    return { ok: false, error: PROJECT_UPDATE_EMPTY, code: "empty_update" };
  }
  return { ok: true, value };
}
