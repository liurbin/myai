# MyAI v0.1 PRD

> **Status**: 本文档是 v0.1 版本的执行计划，服从 [STRATEGY.md](./STRATEGY.md) 的战略选择。`profile` 是 v0.1 的唯一产品主对象。

## 1. Summary

MyAI v0.1 is a local-first product for **AI-native engineering teams** that need to preserve and reuse working AI profiles across tools and team members.

The first release does **not** try to manage every AI artifact or support every platform. It focuses on one narrow promise:

**A team can save a working AI profile in one place and restore or reuse it across people and machines without starting from zero.**

For v0.1, the primary portability path is:

- `Claude Code` -> `Codex CLI`

The product surface is a local repository plus a CLI workflow for importing, storing, searching, applying, syncing, and bootstrapping team profiles.

### Object model

- `asset`: a stored building block such as a prompt, MCP definition, preference file, or skill reference
- `profile`: the product object users manage; a named bundle of assets
- `workflow`: the task or scenario a profile supports

## 2. Problem

Teams are already building real workflows around prompts, MCP servers, and persistent instructions. These workflows often live in scattered locations:

- `.claude/`
- `.agents/`
- chat product instructions
- internal docs or copied snippets

This creates four recurring failures:

1. A useful profile works for one person but is not inherited by the team.
2. A new machine requires manual reconfiguration.
3. A profile proven in one tool cannot be reused in another tool.
4. Teams accumulate AI knowledge, but cannot reliably retrieve or operationalize it.

Existing workarounds such as shared docs, copied config files, and ad hoc Git repos break once profiles become multi-part and tool-specific.

## 3. Target User

### Primary user

Small AI-native product or engineering teams with 5-30 members who:

- use at least two AI tools regularly
- already share prompts, rules, or MCP configs informally
- feel friction during onboarding or machine replacement
- want repeatable team-wide AI workflows, not personal prompt storage only

### Initial design partners

The first pilot users should be teams that actively use both:

- `Claude Code`
- `Codex CLI`

## 4. Jobs To Be Done

When a team has already found an effective AI profile, they want to:

- save it in a durable form
- find it later by name or category
- apply it on another machine
- share it with another teammate
- sync the portable parts into another supported AI tool

## 5. Goals

### Product goals

- Make working AI profiles durable and team-accessible.
- Reduce time required to restore a working AI profile on a new machine.
- Enable basic cross-tool reuse between Claude Code and Codex CLI.
- Prove that teams reuse saved profiles within 14 days.

### Business goals

- Validate demand with 5 design partner teams.
- Prove repeated reuse, not just one-time saving.
- Establish a clear wedge for a paid team product.

## 6. Non-Goals

v0.1 will not:

- support every AI platform
- provide browser extensions
- include a marketplace
- perform advanced auto-organization or recommendations
- guarantee full skill portability across tools
- target light consumer chat users

## 7. Product Principles

- **Local-first**: source of truth lives in a user-controlled local repo.
- **Portable by default**: stored data must remain readable without MyAI.
- **Team-oriented**: profiles should be inheritable, not trapped with one operator.
- **Preview before apply**: bootstrap and apply flows should preview changes before writing local config.
- **Narrow first**: solve one portability path well before expanding.
- **Manual support is acceptable**: early pilots can include founder-led onboarding and migration.

## 8. Core Use Cases

### Use case 1: Import a proven profile

A developer has a working Claude Code profile for code review, including prompts, instructions, and MCP config. They import it into MyAI as a named profile.

### Use case 2: Restore on a new machine

A teammate clones the shared MyAI repo and applies a team profile. The team’s base prompts, preferences, and supported MCP config are restored locally after preview and confirmation.

### Use case 3: Reuse in Codex CLI

A profile imported from Claude Code is translated into the Codex-compatible format where possible, with unsupported parts clearly flagged.

### Use case 4: Search and reapply

A teammate searches for "review" or "backend-debug" and reuses an existing profile instead of rebuilding from scratch.

## 9. Scope

### In scope

- local repository initialization
- asset storage for prompts, MCPs, and preferences
- named profiles
- search/list/view flows
- bootstrap flow for new machines or new teammates
- Claude Code -> Codex CLI sync for supported fields
- warnings for unsupported or lossy translations
- local event logging for pilot validation

### Lightly in scope

- skills as attachable references or templates

### Out of scope

- cross-platform GUI
- cloud sync service
- team permission model
- agent orchestration
- usage analytics dashboard

## 10. User Stories

1. As a developer, I want to import a useful Claude Code profile so I can reuse it later.
2. As a teammate, I want to apply the team’s shared profile on a fresh machine with minimal manual editing.
3. As a team lead, I want one place to keep working prompts, MCP definitions, and preferences so onboarding is repeatable.
4. As a Codex user, I want compatible parts of a Claude profile synced into my environment, with clear warnings for unsupported parts.
5. As a user, I want to search for previously saved profiles by name, category, or keyword.

## 11. Functional Requirements

### 11.1 Repository Initialization

The product must:

- initialize a local MyAI repository
- create standard directories for prompts, MCPs, preferences, profiles, and logs
- create a default repo config file `myai.yaml`
- create `profiles/team` and `profiles/personal` namespaces

### 11.2 Asset Storage

The product must:

- save prompts as Markdown files
- save MCP definitions in a normalized internal format
- save preferences as Markdown or YAML
- associate assets with a named profile

The product should:

- support metadata such as name, description, tags, source tool, and last updated date

### 11.3 Profile

The product must support a named profile object that references:

- prompt files
- preference files
- MCP definitions
- optional skill references

This profile is the unit used for search, sharing, apply, bootstrap, and sync.

### 11.4 Search and Discovery

The product must:

- list saved profiles
- show profile details
- search by name, tag, and keyword

### 11.5 Bootstrap

The product must:

- preview the relevant local changes for a selected profile
- require confirmation before writing local config
- install or copy the relevant local files for a selected profile
- support bootstrapping on a fresh machine from an existing MyAI repo
- show a preview of what will be applied
- default to team profiles; personal profiles must be explicitly selected

### 11.6 Cross-Tool Sync

The product must:

- import supported Claude Code configuration inputs into a profile
- read supported Claude Code configuration inputs
- translate compatible fields to Codex CLI targets
- write target config in the expected Codex format
- report unsupported fields without failing the entire sync

The product must not silently drop unsupported data.

### 11.7 Validation

The product must:

- validate profile references before bootstrap or sync
- validate required fields for MCP definitions
- surface translation warnings in human-readable output

### 11.8 Pilot Logging

The product must:

- write a local event log entry for `profile import`, `profile apply`, `profile sync`, and `bootstrap`
- record timestamp, profile name, source tool, target tool, and outcome

The product may use local structured logs instead of a hosted analytics system in v0.1.

## 12. UX Requirements

v0.1 is CLI-first. The initial commands should feel operational rather than abstract. Examples:

```bash
myai init
myai profile import code-review --from claude-code
myai profile list
myai profile search review
myai profile apply team-default
myai profile sync code-review --to codex
myai bootstrap team-default
```

Output should clearly distinguish:

- which profile was imported or applied
- what was restored
- what was synced
- what could not be translated

## 13. Success Metrics

### North star

- Weekly reused profiles

### Must-win metrics for v0.1

- 5 pilot teams onboarded
- 60% of pilot teams reuse a saved profile within 14 days
- median new-machine recovery time reduced materially versus current process
- at least 1 saved profile synced from Claude Code to Codex CLI in each pilot team

### Anti-metrics

The team should not declare success based only on:

- installs
- number of saved files
- GitHub stars

## 14. Release Criteria

v0.1 is ready for pilot release when:

- one default repository layout is stable
- one profile format is stable
- Claude Code -> Codex sync works for the supported subset
- bootstrap works on a fresh machine in a documented flow
- translation warnings are explicit and understandable
- at least 2 internal end-to-end dry runs succeed

## 15. Risks

- Teams may save profiles once but not reuse them.
- The real unit of value may be task-specific workflow bundles, not current asset categories.
- Claude and Codex config differences may make portability too lossy.
- Teams may prefer simple Git docs over a dedicated tool if profile volume stays low.

## 16. Open Questions

- What exact schema should define a named profile?
- Which Claude Code inputs are in the first supported sync subset?
- Should team and personal preferences merge differently during `profile apply` and `bootstrap`?
- How much manual mapping is acceptable during early pilot onboarding?

## 17. Next Step After PRD

After PRD approval, the team should immediately define:

1. the repository schema
   See [repository-schema.md](./docs/specs/repository-schema.md)
2. the profile schema
   See [profile-schema.md](./docs/specs/profile-schema.md)
3. the Claude Code -> Codex field mapping table
   See [claude-code-to-codex-mapping.md](./docs/specs/claude-code-to-codex-mapping.md)
4. the first CLI command contract
   See [cli-command-spec.md](./docs/specs/cli-command-spec.md)
