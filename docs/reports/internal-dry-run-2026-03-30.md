# Internal Dry Run Record

## Scope

This record documents repo-local dry runs against the current v0.1 CLI and sample repository.
It is not a design partner report and does not claim field validation.

## Run 1: Fresh Machine Restore

Date: 2026-03-30

Scenario:

- start from a clean target directory
- apply a team profile with Codex sync enabled
- verify materialized files and Codex config output

Observed outcome:

- `profile apply` materialized the profile into `.myai-applied/team/code-review/`
- `profile apply` rendered a Codex sync preview
- `profile apply` restored the supported Codex config when `--target-config` was provided
- local warnings were surfaced explicitly
- repo-local event logs captured enough metadata for later `report summary` analysis

Assessment:

- Pass
- The flow is good enough for a scripted pilot demo
- Remaining risk is operator confusion if the target config path is not explicit

## Run 2: Recovery After Local Edit

Date: 2026-03-30

Scenario:

- apply the same profile twice
- edit one materialized file between applies
- rollback to the latest backup

Observed outcome:

- the second `apply` created a backup under `.myai-applied/backups/`
- `rollback` restored the prior materialized state
- the current edited state was preserved as a new backup before restore

Assessment:

- Pass
- The backup/restore loop is reliable enough for an onboarding pilot
- The run confirms `apply` and `rollback` can support basic recovery workflows

## What We Did Not Validate

- Multi-user coordination
- Permission boundaries
- Real design partner onboarding time
- Persistent usage metrics beyond local event logs

## Follow-Up

- Capture the same flow on a real fresh machine
- Track time-to-first-usable-profile for at least 2 pilot operators
- Set `MYAI_ACTOR_ID` and `MYAI_MACHINE_ID` during pilots for stable attribution
- Use `myai report summary` to review repo-local reuse, search, and sync metrics after each pilot run
