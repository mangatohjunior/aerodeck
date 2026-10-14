# Creates the AeroDeck GitHub Project and puts every open issue on it.
#
# Board columns match the labels in .github/workflows/issue-workflow.yml:
#   Backlog → To Do → In Progress → In Review → Done
#
# Requires the project scope:
#   gh auth refresh -h github.com -s project
#
# Usage (from the repo root):
#   pwsh -File scripts/setup_github_project.ps1

$ErrorActionPreference = "Stop"

$Owner = "mangatohjunior"
$Repo = "aerodeck"
$ProjectTitle = "AeroDeck"

function Invoke-Gh {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GhArgs)
    $attempt = 0
    while ($true) {
        $attempt++
        & gh @GhArgs
        if ($LASTEXITCODE -eq 0) { return }
        if ($attempt -ge 3) { throw "gh $($GhArgs -join ' ') failed with exit $LASTEXITCODE" }
        Write-Host "retrying gh ($attempt) after a network error"
        Start-Sleep -Seconds (3 * $attempt)
    }
}

$auth = & gh auth status 2>&1 | Out-String
if ($auth -notmatch "'project'") {
    throw "gh is missing the project scope. Run: gh auth refresh -h github.com -s project"
}

$existing = Invoke-Gh project list --owner $Owner --limit 50 --format json | ConvertFrom-Json
$project = @($existing.projects) | Where-Object { $_.title -eq $ProjectTitle } | Select-Object -First 1
if (-not $project) {
    # The empty board GitHub creates on first visit. Rename it instead of leaving a second blank project.
    $project = @($existing.projects) | Where-Object { $_.title -like "*untitled project" -and $_.items.totalCount -eq 0 } | Select-Object -First 1
}

if (-not $project) {
    Write-Host "Creating project $ProjectTitle"
    $created = Invoke-Gh project create --owner $Owner --title $ProjectTitle --format json | ConvertFrom-Json
    $number = $created.number
} else {
    $number = $project.number
    Write-Host "Using project #$number ($($project.title))"
}

$fieldQuery = @'
query($login: String!, $number: Int!, $field: String!) {
  user(login: $login) {
    projectV2(number: $number) {
      id
      field(name: $field) {
        ... on ProjectV2SingleSelectField {
          id
          options { id name }
        }
      }
    }
  }
}
'@

$projectData = Invoke-Gh api graphql -f query=$fieldQuery -f login=$Owner -F number=$number -f field=Status --jq ".data.user.projectV2" | ConvertFrom-Json
$projectId = $projectData.id
$fieldId = $projectData.field.id
$current = @($projectData.field.options)

function Find-OptionId {
    param([string[]]$Names)
    foreach ($name in $Names) {
        $match = $current | Where-Object { $_.name -eq $name } | Select-Object -First 1
        if ($match) { return $match.id }
    }
    return $null
}

$desired = @(
    @{ name = "Backlog";     color = "GRAY";   aliases = @("Backlog") }
    @{ name = "To Do";       color = "BLUE";   aliases = @("To Do", "Todo") }
    @{ name = "In Progress"; color = "YELLOW"; aliases = @("In Progress") }
    @{ name = "In Review";   color = "PURPLE"; aliases = @("In Review") }
    @{ name = "Done";        color = "GREEN";  aliases = @("Done") }
)

$options = foreach ($column in $desired) {
    $entry = @{ name = $column.name; color = $column.color; description = "" }
    $id = Find-OptionId $column.aliases
    if ($id) { $entry.id = $id }
    [pscustomobject]$entry
}

$mutation = @'
mutation($fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
  updateProjectV2Field(input: { fieldId: $fieldId, name: "Status", singleSelectOptions: $options }) {
    projectV2Field {
      ... on ProjectV2SingleSelectField { options { id name } }
    }
  }
}
'@

function Write-Utf8Json {
    param([string]$Path, [object]$Value)
    $json = $Value | ConvertTo-Json -Depth 8 -Compress
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $json, $utf8)
}

$bodyPath = Join-Path ([System.IO.Path]::GetTempPath()) "aerodeck-project-status.json"
Write-Utf8Json $bodyPath @{
    query     = $mutation
    variables = @{ fieldId = $fieldId; options = @($options) }
}
$updated = Invoke-Gh api graphql --input $bodyPath --jq ".data.updateProjectV2Field.projectV2Field.options" | ConvertFrom-Json
Write-Host ("Status columns: " + (($updated | ForEach-Object { $_.name }) -join " -> "))

$backlogId = ($updated | Where-Object { $_.name -eq "Backlog" }).id
if (-not $backlogId) { throw "Backlog column was not created." }

$readme = @"
AeroDeck delivery board.

Epics own Stories as sub-issues. Status moves with the labels in ``.github/workflows/issue-workflow.yml``:

- Backlog: captured, not started
- To Do: ready to pick up
- In Progress: assigned
- In Review: a pull request uses Closes/Fixes/Resolves #<n>
- Done: the pull request merged, or the issue was closed
"@

$readmeMutation = @'
mutation($projectId: ID!, $readme: String!, $shortDescription: String!, $title: String!) {
  updateProjectV2(input: { projectId: $projectId, title: $title, readme: $readme, shortDescription: $shortDescription }) {
    projectV2 { number url }
  }
}
'@

$readmePath = Join-Path ([System.IO.Path]::GetTempPath()) "aerodeck-project-readme.json"
Write-Utf8Json $readmePath @{
    query     = $readmeMutation
    variables = @{
        projectId        = $projectId
        readme           = $readme
        shortDescription = "Jira-style board for AeroDeck epics and stories"
        title            = $ProjectTitle
    }
}
$projectUrl = Invoke-Gh api graphql --input $readmePath --jq ".data.updateProjectV2.projectV2.url"
Write-Host "Project: $projectUrl"

$issues = Invoke-Gh issue list --repo "$Owner/$Repo" --state open --limit 100 --json "number,title" | ConvertFrom-Json

$onProject = Invoke-Gh project item-list $number --owner $Owner --limit 100 --format json | ConvertFrom-Json
$present = @{}
foreach ($item in @($onProject.items)) {
    if ($item.content.number) { $present[[string]$item.content.number] = $item.id }
}

foreach ($issue in $issues) {
    $issueUrl = "https://github.com/$Owner/$Repo/issues/$($issue.number)"
    if (-not $present.ContainsKey([string]$issue.number)) {
        Invoke-Gh project item-add $number --owner $Owner --url $issueUrl | Out-Null
        Invoke-Gh project item-edit $number --owner $Owner --url $issueUrl --field "Status" --value "Backlog" | Out-Null
        Write-Host "added #$($issue.number) $($issue.title)"
    } else {
        Write-Host "on board #$($issue.number) $($issue.title)"
    }
}

Write-Host "Board ready: $projectUrl"
