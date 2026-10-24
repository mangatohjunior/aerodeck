/** Console project detail; optional hash for a section on the page. */
export function projectDetailPath(
  projectId: string,
  hash: "environments" | "routes" | null = null,
): string {
  const path = `/projects/${encodeURIComponent(projectId)}`;
  return hash ? `${path}#${hash}` : path;
}
