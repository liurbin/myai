# CLI Command Spec

## Purpose

This document defines the v0.1 command contract for the MyAI CLI.

The CLI is profile-centric. Commands should operate on `profile` as the main product object, while assets remain underlying storage units.

## Command Shape

The CLI uses this general form:

```bash
myai <command> [subcommand] [args] [flags]
```

v0.1 commands:

- `myai init`
- `myai profile import`
- `myai profile list`
- `myai profile show`
- `myai profile search`
- `myai profile apply`
- `myai profile rollback`
- `myai profile sync`
- `myai bootstrap`
- `myai report summary`

## Global Rules

- commands run from the repository root unless a repo path is provided
- human-readable output is the default
- non-zero exit codes indicate failure
- warnings must be shown explicitly and must not be silently ignored
- pilot attribution may be overridden with `MYAI_ACTOR_ID` and `MYAI_MACHINE_ID`

## `myai init`

Initializes a MyAI repository.

Example:

```bash
myai init
```

Behavior:

- create `~/.myai/` if it does not exist
- create default directories from the repository schema
- create `myai.yaml`

Output:

- repo path
- directories created
- success or failure summary

## `myai profile import`

Imports a source-tool profile into the repository.

Example:

```bash
myai profile import code-review --from claude-code
```

Arguments:

- `<slug>`: target profile slug

Required flags:

- `--from <source-tool>`

Supported values in v0.1:

- `claude-code`

Behavior:

- read supported source inputs
- normalize source data into repository assets
- create or update `profiles/<scope>/<slug>.yaml`
- write warnings for unsupported or lossy fields
- append an event log entry

Success output should include:

- profile slug
- scope
- imported assets
- warnings

## `myai profile list`

Lists saved profiles.

Example:

```bash
myai profile list
myai profile list --scope team
```

Optional flags:

- `--scope <team|personal>`

Behavior:

- show profile slug, name, scope, and tags

## `myai profile show`

Shows details for one profile.

Example:

```bash
myai profile show code-review
```

Behavior:

- show metadata
- show referenced assets
- show sync support

## `myai profile search`

Searches profiles by slug, name, tags, or description.

Example:

```bash
myai profile search review
```

Behavior:

- return matching profiles with short summaries
- append a local `profile.search` event with `query`, `result_count`, and `matched_profiles`

## `myai profile apply`

Applies a profile to the local environment.

Example:

```bash
myai profile apply team-default --target-dir . --target-config ~/.codex/config.toml
```

Behavior:

- resolve the target profile
- preview changes
- include Codex sync preview when the profile declares `sync.targets: [codex]`
- require confirmation by default
- materialize profile assets into `<target-dir>/.myai-applied/<scope>/<slug>/`
- create a backup under `<target-dir>/.myai-applied/backups/` when re-applying
- apply profile assets using merge-safe semantics
- sync supported Codex config when the profile declares `sync.targets: [codex]`
- append an event log entry

Default rules:

- team profiles are eligible by default
- personal profiles require explicit selection
- current working directory is the default target when `--target-dir` is omitted
- `--target-config` overrides the default Codex config path

## `myai profile rollback`

Restores the latest backup for a previously applied profile.

Example:

```bash
myai profile rollback team-default --target-dir .
```

Behavior:

- resolve the target profile
- find the latest backup under `<target-dir>/.myai-applied/backups/`
- require confirmation by default
- restore that backup into `<target-dir>/.myai-applied/<scope>/<slug>/`
- back up the current materialized state before restoring, when present
- append an event log entry

## `myai profile sync`

Syncs a profile to a supported target tool.

Example:

```bash
myai profile sync code-review --to codex
```

Arguments:

- `<slug>`: profile slug

Required flags:

- `--to <target-tool>`

Supported values in v0.1:

- `codex`

Behavior:

- read the normalized profile
- translate supported fields to target format
- write target config
- emit warnings for dropped or unsupported fields
- append an event log entry

## `myai bootstrap`

Bootstraps a machine from repository defaults.

Example:

```bash
myai bootstrap team-default --target-dir . --target-config ~/.codex/config.toml
```

Behavior:

- resolve the named profile
- preview changes
- include Codex sync preview when the profile declares `sync.targets: [codex]`
- require confirmation
- apply bootstrap-safe defaults
- default to team profiles; personal profiles require explicit `--scope personal`
- materialize files into `<target-dir>/.myai-applied/`
- sync supported Codex config when the profile declares `sync.targets: [codex]`
- append an event log entry

## `myai report summary`

Summarizes repo-local pilot metrics from structured event logs.

Example:

```bash
myai report summary --since 14d --format json
```

Behavior:

- read `logs/events-*.jsonl` from the current repository
- summarize created profiles, reused profiles, cross-tool sync activity, search activity, and recent failures
- report unique actors and machines seen in the selected window
- report search-to-reuse within 24 hours when the same actor or machine later applies, bootstraps, or syncs a matched profile
- report command outcomes for import, search, apply, sync, bootstrap, and rollback
- default to a 14-day window when `--since` is omitted

Optional flags:

- `--since <all|14d|7d|YYYY-MM-DD>`
- `--format <text|json>`

## Exit Codes

- `0`: success
- `1`: validation or user error
- `2`: repository or filesystem error
- `3`: import or sync translation error

## v0.1 Constraints

- only `claude-code` is supported as an import source
- only `codex` is supported as a sync target
- destructive overwrite modes are out of scope
- interactive confirmation is the default for apply, rollback, and bootstrap
