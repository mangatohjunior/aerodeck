/** Console project detail; optional hash for the environments section. */
export function projectDetailPath(projectId: string, hash: "environments" | null = null): string {
  const path = `/projects/${encodeURIComponent(projectId)}`;
  return hash ? `${path}#${hash}` : path;
}
