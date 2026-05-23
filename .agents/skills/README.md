# Codex Skills (Repo-Local)

This directory contains **repo-local Codex-native skills** for Delight Desk backend operations.

## Structure standard

Each skill should live in its own folder:

```text
.agents/skills/<skill-name>/SKILL.md
```

Recommended optional files per skill:

- `runbook.md` for extended procedures
- `templates/` for reusable command snippets
- `evidence/` guidance for QA logging formats

## Authoring rules for this repo

1. Prefer **staging API execution** over local app boot when possible.
2. Never require plaintext secrets in chat; use Codex project secrets.
3. Define:
   - required env vars
   - optional env vars
   - explicit blocker behavior
   - rollback/evidence requirements
4. Keep workflows scenario-based with deterministic case IDs.
5. Include a “preflight” command section that fails fast.
6. Treat every skill as **recursive and continuously improving**:
   - when a new blocker/scenario is discovered and resolved, update that skill in the same execution cycle;
   - add the new detection/remediation step to preflight, workflow, or blocker policy;
   - persist evidence so future runs are faster and more deterministic.

## Current skills

- `wismo-qa` — End-to-end QA execution for WISMO agent via staging APIs and QA mailbox simulation.
