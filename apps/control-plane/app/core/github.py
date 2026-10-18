"""GitHub repository URLs. The stored value never keeps a user, query, or fragment."""

from urllib.parse import urlsplit

_HOSTS = {"github.com", "www.github.com"}


def parse_github_repo(value: str) -> tuple[str, str] | None:
    try:
        parsed = urlsplit(value.strip())
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in _HOSTS:
        return None
    parts = [part for part in parsed.path.removesuffix(".git").split("/") if part]
    if len(parts) < 2:
        return None
    owner, repo = parts[0], parts[1]
    if owner in {".", ".."} or repo in {".", ".."}:
        return None
    if len(owner) > 100 or len(repo) > 100:
        return None
    return owner, repo


def canonical_github_repo_url(owner: str, repo: str) -> str:
    return f"https://github.com/{owner}/{repo}"
