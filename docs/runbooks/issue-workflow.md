# Issue workflow

Epics own Stories as GitHub sub-issues. Status is a project field **and** a
label. `.github/workflows/issue-workflow.yml` moves the label; the AeroDeck
project board columns match.

## Columns

| Label | Board | What moved it |
| ----- | ----- | ------------- |
| `status: backlog` | Backlog | Created, not started |
| `status: to-do` | To Do | Issue reopened |
| `status: in-progress` | In Progress | Someone assigned, or a PR closed without merging |
| `status: in-review` | In Review | A PR body/title uses `Closes` / `Fixes` / `Resolves #<n>` |
| `status: done` | Done | That PR merged, or the issue was closed |

Forward moves never go backwards except those two regressions (unmerged PR,
reopen).

## Starting a story

```bash
git checkout main && git pull
git checkout -b feat/<n>-short-slug
gh issue edit <n> --add-assignee @me \
  --add-label "status: in-progress" --remove-label "status: backlog"
```

Open the PR with `Closes #<n>` in the body so merge closes the story and the
board moves to Done.

## Recreating the board

If the project is missing:

```bash
gh auth refresh -h github.com -s project
pwsh -File scripts/setup_github_project.ps1
```

The backlog of Epics and Stories: `bash scripts/setup_github_backlog.sh`
(idempotent; existing titles are reused).
