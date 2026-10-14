---
name: "Epic"
about: "A large body of work that delivers a platform capability and is broken down into linked User Stories."
title: "[EPIC] <capability name>"
labels: ["type: epic"]
assignees: []
---

<!--
  Taxonomy: Epic -> Story -> (Task/Bug as sub-issues).
  An Epic is DONE only when every linked Story is closed and the Definition of Done below is met.
  Keep this issue updated — it is the single source of truth for the capability.
-->

## Objective

<!-- One or two sentences: what capability exists when this Epic is complete, and for whom. -->

## Problem statement

<!-- What is broken, missing, or slow today? Link to evidence (incidents, metrics, user feedback). -->

## Scope

### In scope

-

### Out of scope

-

## Success metrics

<!-- Measurable outcomes. Example: "p95 latency of /api/v1/deployments < 300 ms", "zero manual steps to provision a dev environment". -->

| Metric | Baseline | Target |
| ------ | -------- | ------ |
|        |          |        |

## Scope & User Stories

<!--
  Every Story that belongs to this Epic MUST be listed here as a task-list item so GitHub tracks progress.
  Create each Story with the "User Story" template and reference this Epic in its "Parent Epic" field.
-->

- [ ] #
- [ ] #
- [ ] #

## Architecture & design notes

<!-- Links to ADRs (docs/adr/), diagrams, API contracts, Terraform stacks affected. Call out which .cursor/rules apply. -->

- Affected areas: `apps/control-plane` / `packages/iac-engine` / `.github/workflows` (delete as appropriate)
- ADRs:
- Diagrams:

## Risks & dependencies

<!-- External teams, provider limits (DigitalOcean quotas), security review, data migrations. -->

| Risk / dependency | Impact | Mitigation | Owner |
| ----------------- | ------ | ---------- | ----- |
|                   |        |            |       |

## Definition of Done

- [ ] All linked Stories closed
- [ ] Success metrics measured and recorded above
- [ ] Documentation updated (README, runbooks, ADRs)
- [ ] Infrastructure changes applied via GitOps pipeline (no manual `terraform apply`)
- [ ] Security review complete (if the Epic touches auth, secrets, or network boundaries)
- [ ] Stakeholders notified / demo delivered
