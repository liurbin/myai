# Claude Code to Codex Mapping

## Purpose

This document defines the v0.1 portability policy for:

`Claude Code -> MyAI profile -> Codex CLI`

It does **not** claim full tool compatibility. It defines the supported subset MyAI will translate, and the fields that must surface warnings.

## Mapping Strategy

v0.1 uses a two-step model:

1. import supported Claude Code inputs into a normalized MyAI profile
2. sync supported profile fields into Codex CLI

This keeps tool-specific logic at the edges and keeps the repository schema portable.

## Supported Mapping Categories

### 1. Prompt Assets

| Source | MyAI profile | Codex target | Notes |
|---|---|---|---|
| reusable Claude prompt/instruction text | `assets.prompts[]` | referenced prompt asset | stored as Markdown asset; not inlined into target config by default |

### 2. Preference Assets

| Source | MyAI profile | Codex target | Notes |
|---|---|---|---|
| Claude Code reusable rules/instructions | `assets.preferences[]` | Codex-compatible instruction material | applied through profile sync/apply flow; merge semantics only |

### 3. MCP Assets

| Source field | MyAI normalized field | Codex target field | v0.1 behavior |
|---|---|---|---|
| server name | MCP asset filename / internal name | server name | preserve |
| transport type | normalized transport | target transport | preserve if supported |
| command | command | command | preserve |
| args | args | args | preserve |
| env | env | env | preserve when representable |
| url | url | url | preserve if supported |

## Lossy or Unsupported Mapping

These fields must not be silently dropped.

| Source capability | v0.1 handling | Output requirement |
|---|---|---|
| unsupported transport variant | drop | emit warning |
| headers not representable in Codex target | drop | emit warning |
| source-tool-only metadata | ignore | optional info note |
| non-portable variable syntax | preserve as raw text when safe, otherwise drop | emit warning |
| skill behavior requiring source-tool runtime features | keep as profile reference only | emit warning during sync |

## Sync Outcome Rules

### Success

Use when all required target fields were written and no blocking incompatibility was found.

### Partial Success

Use when the target config was written but one or more fields were dropped or downgraded.

### Failure

Use when the target config cannot be written safely.

## Warning Examples

Examples of explicit warnings:

- `Warning: MCP headers for sentry were not synced to codex.`
- `Warning: Skill reference review-pr is stored in the profile but not applied to codex.`
- `Warning: Variable syntax in github MCP env could not be translated exactly.`

## Minimal Supported Subset for v0.1

The sync path is considered supported only when a profile contains:

- prompt assets
- preference assets
- MCP definitions using representable command, args, env, or URL fields

The sync path is not considered fully supported for:

- source-tool-specific skills
- destructive overwrite behavior
- advanced runtime orchestration

## Example Translation Outcome

### Source profile

```yaml
assets:
  prompts:
    - prompts/code-review.md
  preferences:
    - preferences/team-review-rules.md
  mcps:
    - mcps/github.yaml
    - mcps/context7.yaml
```

### Expected Codex sync behavior

- generate target MCP configuration for supported MCP assets
- preserve profile-level prompt and preference assets for local apply/use
- emit warnings for any unsupported MCP fields

## Validation Rules

Before sync, MyAI must verify:

- profile exists
- target is `codex`
- all referenced MCP assets are valid
- target write location is available

## v0.1 Constraints

- only `Claude Code -> Codex CLI` is in scope
- MyAI should prefer explicit warnings over clever fallback behavior
- MyAI should not invent missing target fields
