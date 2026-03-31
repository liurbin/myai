# MyAI

> Save your team's working AI profiles. Restore them on new machines. Reuse them across tools.

## The Problem

Teams are building real workflows around AI tools — prompts, MCP servers, persistent instructions, skills. But the reusable profiles behind them are scattered and locked in:

- `.claude/` — Claude Code rules, skills, MCP config
- `.agents/` — Codex CLI agent config
- `.cursorrules` — Cursor rules
- Internal docs, chat histories, copied snippets

This creates recurring failures:

1. A useful profile works for one person but is not inherited by the team.
2. A new machine requires manual reconfiguration.
3. A profile proven in one tool cannot be reused in another.
4. Teams accumulate AI knowledge but cannot reliably retrieve or operationalize it.

**Switch tools = start from zero. New teammate = start from zero. New machine = start from zero.**

## What is MyAI?

MyAI is an **AI workflow portability layer** — a CLI tool that lets teams save, restore, and sync working AI profiles across tools, machines, and team members.

When a profile declares `sync.targets: [codex]`, both `profile apply` and `bootstrap` include a Codex sync preview in the logged bundle and restore the supported Codex config after materializing the profile.

The core product object is a `profile`, which references reusable assets:

- **Prompts** — reusable, proven prompts
- **MCP Servers** — external tool connections
- **Preferences** — team and personal rules, instructions
- **Skills** — workflow templates (light support)

In product terms:

- `asset` = a stored building block
- `profile` = a reusable bundle of assets
- `workflow` = the task the profile helps complete

### Core Principles

- **Local-first** — your data lives in `~/.myai/`, a plain Git repo you own
- **Portable by default** — stored data remains readable without MyAI
- **Team-oriented** — workflows are inheritable, not trapped with one person
- **Narrow first** — solve one portability path well before expanding
- **Standard formats** — Markdown + YAML, no vendor lock-in

## Install

Current release track: `0.1.0-alpha`.

```bash
npm install -g @myai/cli
myai help
```

Or run without a global install:

```bash
npx @myai/cli help
```

Requirements:

- Node.js 18+

## Quickstart

```bash
myai profile list --repo ./examples/sample-repo
myai profile show code-review --repo ./examples/sample-repo
myai profile apply code-review --repo ./examples/sample-repo --target-dir /tmp/myai-demo --target-config /tmp/myai-demo-codex.toml --yes
myai report summary --repo ./examples/sample-repo --since all
```

To create a fresh local repository instead of using the sample:

```bash
myai init
```

## How It Works

```bash
myai init                                          # Initialize local repo
myai profile import code-review --from claude-code # Import a working Claude Code profile
myai profile list                                  # List saved profiles
myai profile search review                         # Find profiles by keyword
myai profile apply team-default --target-dir .     # Materialize a team profile and restore supported Codex config
myai profile rollback team-default --target-dir .  # Restore the latest applied backup for a profile
myai profile sync code-review --to codex           # Sync a profile to Codex CLI
myai bootstrap team-default --target-dir .         # Bootstrap team defaults and restore supported Codex config
myai report summary --since 14d                    # Summarize repo-local pilot reuse, search, and attribution metrics
```

## Pilot Telemetry

For internal pilots, set stable operator and machine identifiers before running commands:

```bash
export MYAI_ACTOR_ID=pilot-operator-1
export MYAI_MACHINE_ID=macbook-air-01
```

`myai report summary` then surfaces unique actors, unique machines, search volume, zero-result searches, and search-to-reuse within 24 hours. Logs stay local under `~/.myai/logs/`.

## Storage

```
~/.myai/
├── prompts/              # Saved prompts (Markdown)
├── mcps/                 # MCP server configs (normalized format)
├── preferences/          # Team and personal rules
├── profiles/
│   ├── team/
│   └── personal/
├── skills/               # Optional workflow templates (light support)
├── logs/                 # Local event logs for pilot validation
└── myai.yaml             # Repo config
```

It's just files. Back it up with Git. Share it with your team. Move it to a new machine in 30 seconds.

## Current Focus

v0.1 focuses on one narrow promise:

**A team can save a working AI profile in one place and restore or reuse it across people and machines without starting from zero.**

- Primary portability path: **Claude Code → Codex CLI**
- Product surface: local repo + CLI
- Target users: AI-native engineering teams (5-30 members) using multiple AI tools

## Docs

| Doc | What it covers |
|-----|---------------|
| [STRATEGY.md](./STRATEGY.md) | Product strategy, ICP, wedge, pricing, GTM, kill criteria |
| [PRD-v0.1.md](./PRD-v0.1.md) | v0.1 scope, requirements, use cases, success metrics |
| [repository-schema.md](./docs/specs/repository-schema.md) | On-disk repository layout, namespaces, logs, bootstrap defaults |
| [profile-schema.md](./docs/specs/profile-schema.md) | Main product object schema and validation rules |
| [cli-command-spec.md](./docs/specs/cli-command-spec.md) | CLI command contract, flags, defaults, and exit codes |
| [claude-code-to-codex-mapping.md](./docs/specs/claude-code-to-codex-mapping.md) | Supported portability subset and explicit warning policy |
| [fresh-machine-pilot-runbook.md](./docs/runbooks/fresh-machine-pilot-runbook.md) | Step-by-step fresh-machine and pilot validation flow |
| [internal-dry-run-2026-03-30.md](./docs/reports/internal-dry-run-2026-03-30.md) | Repo-local dry run record and current validation gaps |
| [examples/README.md](./examples/README.md) | Sample repository for demos, pilots, and manual testing |
| [IDEA-archive.md](./docs/archive/IDEA-archive.md) | Early vision exploration (historical) |

## License

MIT
