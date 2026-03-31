# Claude Code Guide

## Source of Truth

Use `AGENTS.md` for contributor workflow, command conventions, and PR expectations. Use `README.md` for public product positioning. Use `docs/specs/cli-command-spec.md`, `docs/specs/profile-schema.md`, and `docs/specs/repository-schema.md` for behavior, storage, and validation rules. If guidance conflicts, follow the specs.

## Product Frame

MyAI is a local-first CLI for developers and teams that need to save, restore, and sync reusable AI profiles across tools and machines. The current v0.1 wedge is `Claude Code -> MyAI repo -> Codex CLI`. The product is profile-centric: `asset` is the storage unit, `profile` is the main object users manage, and `scope` is `team` or `personal`.

## Working Rules

- Runtime code lives in `src/`; tests live in `tests/`; demo fixtures live in `examples/sample-repo/`.
- Use TypeScript ESM, 2-space indentation, `kebab-case.ts` filenames, `camelCase` functions, and `PascalCase` types.
- Keep CLI language explicit and verb-first.
- Add or update tests for any CLI behavior, import/sync mapping, or apply/rollback change.
- Verify with `npm run build` and `npm test`; use `npm run test:watch` only for local iteration.
- Match the existing Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, and `chore:`.

## Key Documents

- [STRATEGY.md](./STRATEGY.md) — product strategy and wedge
- [PRD-v0.1.md](./PRD-v0.1.md) — scope, requirements, and success metrics
- [docs/specs/](./docs/specs/) — CLI, profile, repository, and mapping specs
- [docs/runbooks/](./docs/runbooks/) — pilot execution and validation notes
