# MyAI Project Guidelines

## What is this?

MyAI is an AI workflow portability layer — a CLI tool that lets teams save, restore, and sync working AI profiles across tools, machines, and team members. Current portability path: Claude Code → Codex CLI.

## Product Concepts

- `asset` — a stored building block (prompt, MCP config, preference, skill)
- `profile` — a named, reusable bundle of assets (the core product object)
- `scope` — profiles live under `team/` or `personal/`
- `sync` — translating a profile's assets into another tool's format (currently Codex CLI)

## Tech Stack

- TypeScript + Node.js (ESM)
- CLI-only (no server, no GUI)
- Standard formats: Markdown for prompts/preferences, YAML for profiles/MCPs/config
- Git for storage and sync
- Vitest for testing

## Project Structure

```
src/
├── cli.ts              # Executable shim
├── index.ts            # CLI command routing and handlers
├── types.ts            # Core type definitions (Profile, McpAsset, EventLogEntry)
└── lib/
    ├── apply.ts         # profile apply + rollback (with backup)
    ├── assets.ts        # Asset file reading
    ├── claude.ts        # Claude Code import adapter
    ├── codex.ts         # Codex CLI sync adapter
    ├── format.ts        # Slugify and formatting utils
    ├── fs.ts            # File system helpers
    ├── logging.ts       # Event log (pilot telemetry)
    ├── profile-store.ts # Profile CRUD (list, load, search)
    ├── repo.ts          # Repository init and path resolution
    ├── reporting.ts     # Report summary generation
    ├── validation.ts    # Schema and reference validation
    └── yaml.ts          # YAML read/write wrapper

tests/                   # Vitest test files (*.test.ts)
docs/specs/              # Technical specs (repo schema, profile schema, CLI spec, field mapping)
docs/runbooks/           # Pilot runbooks
examples/sample-repo/    # Demo fixtures for manual testing and pilots
```

## Key Decisions

- Local-first: all data in `~/.myai/`, no cloud dependency
- CLI-first: management through commands, not config editing
- v0.1 scope: Claude Code → Codex CLI only, one portability path
- Profile as core object: assets are referenced by profiles, not managed standalone
- Lossy sync is explicit: unsupported fields produce warnings, never silently dropped

## Development

- Branch: work on `main`
- Commits: short imperative subjects (e.g. `Add profile rollback command`)
- Tests: add/update tests for every CLI behavior change and import/sync edge case
- Before merge: `npm run build && npm test`

## Key Documents

- [STRATEGY.md](./STRATEGY.md) — current product strategy (authoritative)
- [PRD-v0.1.md](./PRD-v0.1.md) — v0.1 scope and requirements
- [docs/specs/](./docs/specs/) — technical specs (repo schema, profile schema, CLI spec, field mapping)
