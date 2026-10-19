/** Matches control-plane `Slug` in `app/schemas/common.py`. */
const PROJECT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const PROJECT_NAME_MAX = 120;
export const PROJECT_SLUG_MAX = 63;
export const PROJECT_DESCRIPTION_MAX = 1000;

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
