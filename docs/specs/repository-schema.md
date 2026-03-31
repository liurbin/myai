# Repository Schema

## Purpose

This document defines the default on-disk layout for a MyAI repository in v0.1.

The repository is the local source of truth. It must remain readable and usable without MyAI.

## Root Layout

```text
~/.myai/
├── myai.yaml
├── prompts/
├── mcps/
├── preferences/
├── profiles/
│   ├── team/
│   └── personal/
├── skills/
└── logs/
```

## Root Files

### `myai.yaml`

Repository-level config.

Required fields:

- `version`
- `name`
- `default_profile_scope`
- `supported_targets`

Example:

```yaml
version: 1
name: my-team-ai
default_profile_scope: team
supported_targets:
  - codex
```

## Directories

### `prompts/`

Stores prompt assets as Markdown.

Rules:

- use `kebab-case.md`
- organize by optional subfolders when helpful
- prompts are reusable assets, not product-level objects

Examples:

```text
prompts/code-review.md
prompts/debug/backend-debug.md
```

### `mcps/`

Stores MCP definitions in normalized YAML.

Rules:

- one file per MCP server
- filename uses `kebab-case.yaml`
- internal schema should stay source-tool agnostic

Examples:

```text
mcps/github.yaml
mcps/context7.yaml
```

### `preferences/`

Stores reusable team or personal instruction assets.

Rules:

- Markdown or YAML is allowed
- keep team and personal preferences in separate subfolders if volume grows

Examples:

```text
preferences/team-review-rules.md
preferences/personal-style.md
```

### `profiles/`

Stores the main product object.

Subdirectories:

- `profiles/team/`
- `profiles/personal/`

Rules:

- one file per profile
- filename uses profile slug with `.yaml`
- `team` is the default scope for `bootstrap`
- `personal` profiles are never applied implicitly

Examples:

```text
profiles/team/code-review.yaml
profiles/team/team-default.yaml
profiles/personal/eddie-debug.yaml
```

### `skills/`

Stores optional skill references or imported skill templates.

v0.1 notes:

- skill support is lightweight
- skill files may be referenced by profiles
- cross-tool portability is not guaranteed

### `logs/`

Stores local structured logs for pilot validation.

Rules:

- use JSON Lines format
- rotate by day or month
- logs are local operational artifacts, not product-facing assets

Example:

```text
logs/events-2026-03.jsonl
```

## Naming Rules

- slugs use `kebab-case`
- profile filenames must match the profile slug
- asset references in profile files are repository-relative paths
- avoid spaces and uppercase characters in file and directory names

## Scope Rules

### Team scope

Use for shared, inheritable profiles and assets.

Default behaviors:

- shown in normal list/search results
- eligible for bootstrap by default
- safe for onboarding workflows

### Personal scope

Use for user-specific variations.

Default behaviors:

- must be explicitly selected
- never applied during default bootstrap
- should not overwrite team assets unless the user confirms

## Bootstrap Rules

`bootstrap` operates against repository state plus one or more team profiles.

v0.1 defaults:

- preview changes before apply
- confirm before writing local config
- apply team profiles by default
- require explicit opt-in for personal profiles

## Applied State Outside The Repo

`apply`, `rollback`, and `bootstrap` write to a target directory rather than mutating the repository itself.

Layout:

```text
<target-dir>/.myai-applied/
├── team/<slug>/
├── personal/<slug>/
└── backups/
```

Rules:

- materialized profile content lives under `<scope>/<slug>/`
- each re-apply stores the previous materialized state in `backups/`
- backup folder names use `<scope>-<slug>-<timestamp>`
- rollback restores the latest matching backup and first snapshots the current state when it exists
- apply and bootstrap may also sync supported Codex config outside the repo, normally at `~/.codex/config.toml`

## Event Log Schema

Each log entry in `logs/*.jsonl` should contain:

- `timestamp`
- `event`
- `profile`
- `scope`
- `source_tool`
- `target_tool`
- `status`
- `duration_ms` (optional)
- `actor_id` (optional, usually injected from `MYAI_ACTOR_ID` or the local user)
- `machine_id` (optional, usually injected from `MYAI_MACHINE_ID` or hostname)
- `repo_name` (optional, injected from `myai.yaml` when available)
- `query` (optional, for `profile.search`)
- `result_count` (optional, for `profile.search`)
- `matched_profiles` (optional, for `profile.search`)

Example:

```json
{"timestamp":"2026-03-30T14:35:00Z","event":"profile.sync","profile":"code-review","scope":"team","source_tool":"claude-code","target_tool":"codex","status":"success","duration_ms":24}
```

Search telemetry example:

```json
{"timestamp":"2026-03-30T14:36:00Z","event":"profile.search","profile":"(search)","scope":"team","status":"success","actor_id":"pilot-operator-1","machine_id":"mba-01","repo_name":"myai","query":"review","result_count":1,"matched_profiles":["code-review"]}
```

## v0.1 Constraints

- Only `Claude Code -> Codex CLI` portability is in active scope.
- Repository schema must not assume cloud sync.
- Repository schema must not require a database.
- Repository schema should tolerate manual Git editing.
