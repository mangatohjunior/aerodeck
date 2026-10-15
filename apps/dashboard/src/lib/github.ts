export function parseGithubRepo(
  value: string,
): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") {
      return null;
    }
    const [owner, repo] = parsed.pathname
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean);
    if (!owner || !repo) {
      return null;
    }
    return { owner, repo };
  } catch {
    return null;
  }
}
