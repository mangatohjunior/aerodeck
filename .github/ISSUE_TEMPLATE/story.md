---
name: "User Story"
about: "A single, independently shippable increment of user-facing or platform value, linked to a parent Epic."
title: "[STORY] <short outcome>"
labels: ["type: story"]
assignees: []
---

<!--
  Taxonomy: Epic -> Story -> (Task/Bug as sub-issues).
  A Story should be completable in a single sprint and merged through one or a few PRs.
  PRs MUST reference this Story with "Closes #<n>" so the AI PR reviewer can correlate scope.
-->

## Parent Epic

<!-- Required. Link the Epic this Story belongs to, then add this Story to the Epic's "Linked Stories" checklist. -->

- Epic: #

## User story (required)

**As a** <role — e.g. platform engineer, application developer, SRE>
**I want** <capability or behaviour>
**so that** <measurable benefit or outcome>.

## Context

<!-- Why now? Link designs, ADRs, incidents, or prior discussion. Keep it short. -->

## Acceptance criteria (required)

<!--
  Write testable, binary statements. Prefer Given / When / Then.
  Every item must be verifiable by a reviewer or an automated test before the Story is closed.
-->

- [ ] **Given** <precondition>, **when** <action>, **then** <observable result>.
- [ ] **Given** <precondition>, **when** <action>, **then** <observable result>.
- [ ] Error / edge case: <what happens when input is invalid, provider API fails, etc.>
- [ ] Non-functional: <latency, security, observability requirement>

## Technical Implementation Notes

<!-- Implementation guidance for whoever (human or AI) picks this up. Be concrete about where code lands. -->

- **Affected components:** `apps/control-plane` / `apps/dashboard` / `packages/iac-engine` / `.github/workflows` (delete as appropriate)
- **API changes:** <new/changed endpoints under /api/v1, request/response schemas>
- **Data model / migrations:** <tables, Alembic migration needed?>
- **Infrastructure:** <DigitalOcean resources, Terraform variables, state key>
- **Config / secrets:** <new `AERODECK_*` settings or CI secrets; never commit values>
- **Guardrails to respect:** `.cursor/rules/fastapi-architecture.mdc`, `.cursor/rules/nextjs-dashboard.mdc`, `.cursor/rules/terraform-digitalocean.mdc`
- **Open questions:**

## Test plan

- [ ] Unit tests added/updated
- [ ] Integration/API tests added/updated
- [ ] `terraform fmt -check && terraform validate` passes (if IaC changed)
- [ ] Manual verification steps documented in the PR

## Definition of Done

- [ ] All acceptance criteria checked off
- [ ] PR merged with passing CI and an AI review verdict of `APPROVE` or `COMMENT`
- [ ] Documentation / runbook updated
- [ ] Parent Epic checklist updated
