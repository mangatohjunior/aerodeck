from app.core.github import canonical_github_repo_url, parse_github_repo


def test_parse_github_repo_keeps_owner_and_repo() -> None:
    assert parse_github_repo("https://github.com/Org/Repo.git") == ("Org", "Repo")
    assert parse_github_repo("https://github.com/Org/Repo/tree/main") == ("Org", "Repo")
    assert canonical_github_repo_url("Org", "Repo") == "https://github.com/Org/Repo"


def test_parse_github_repo_rejects_other_hosts() -> None:
    assert parse_github_repo("https://gitlab.com/org/repo") is None
    assert parse_github_repo("not a url") is None
    assert parse_github_repo("https://github.com/only-owner") is None
