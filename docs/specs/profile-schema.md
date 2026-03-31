# Profile Schema

## Purpose

This document defines the v0.1 schema for a MyAI `profile`.

A profile is the main product object. It is a named, reusable bundle of assets that can be searched, applied, bootstrapped, and synced across supported tools.

## File Location

Profiles live under:

- `profiles/team/*.yaml`
- `profiles/personal/*.yaml`

The filename must match the profile slug.

Example:

```text
profiles/team/code-review.yaml
```

## Required Fields

```yaml
version: 1
kind: profile
name: Code Review
slug: code-review
scope: team
```

### Field Definitions

- `version`: schema version, starts at `1`
- `kind`: must be `profile`
- `name`: human-readable display name
- `slug`: stable machine-readable identifier
- `scope`: `team` or `personal`

## Recommended Fields

```yaml
description: Review pull requests with team rules and GitHub context
tags:
  - review
  - engineering
source:
  tool: claude-code
  imported_at: 2026-03-30T14:40:00Z
```

### Recommended semantics

- `description`: short purpose statement
- `tags`: flat list for search and grouping
- `source.tool`: initial import source
- `source.imported_at`: ISO-8601 timestamp

## Asset References

Each profile references repository-relative asset paths.

```yaml
assets:
  prompts:
    - prompts/code-review.md
  preferences:
    - preferences/team-review-rules.md
  mcps:
    - mcps/github.yaml
    - mcps/context7.yaml
  skills:
    - skills/review-pr/SKILL.md
```

Rules:

- all paths are repository-relative
- missing references must fail validation
- `skills` is optional and lightly supported in v0.1

## Apply Section

The `apply` block defines default application behavior.

```yaml
apply:
  mode: merge
  confirm: true
```

Rules:

- `mode` supports `merge` in v0.1
- destructive overwrite is out of scope for default behavior
- `confirm` should default to `true`

## Sync Section

The `sync` block defines portability intent and supported targets.

```yaml
sync:
  source: claude-code
  targets:
    - codex
```

Rules:

- v0.1 supports `source: claude-code`
- v0.1 supports `targets: [codex]`
- unsupported targets must fail validation

## Example Profile

```yaml
version: 1
kind: profile
name: Code Review
slug: code-review
scope: team
description: Review pull requests with team rules and GitHub context
tags:
  - review
  - backend
source:
  tool: claude-code
  imported_at: 2026-03-30T14:40:00Z
assets:
  prompts:
    - prompts/code-review.md
  preferences:
    - preferences/team-review-rules.md
  mcps:
    - mcps/github.yaml
    - mcps/context7.yaml
  skills: []
apply:
  mode: merge
  confirm: true
sync:
  source: claude-code
  targets:
    - codex
```

## Validation Rules

The profile validator must check:

- required fields exist
- `kind` is `profile`
- `scope` is `team` or `personal`
- filename matches `slug`
- all asset references exist
- `sync.source` is supported
- all `sync.targets` are supported

## v0.1 Design Constraints

- profiles should stay human-editable
- profiles should reference assets, not inline large prompt bodies
- one profile should represent one reusable working configuration
- do not encode multi-step agent orchestration into the profile schema

## Relationship to Other Objects

- `asset`: a stored building block used by one or more profiles
- `profile`: the reusable object users manage directly
- `workflow`: the task scenario a profile helps complete
