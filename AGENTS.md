# Repository Guidelines

## Project Structure & Module Organization

MyAI is a TypeScript CLI plus product docs. Keep runtime entrypoints in `src/cli.ts` and `src/index.ts`, reusable domain logic in `src/lib/`, and shared types in `src/types.ts`. Put automated tests in `tests/*.test.ts`. Store product specs in `docs/specs/`, runbooks in `docs/runbooks/`, archived notes in `docs/archive/`, and demo fixtures in `examples/sample-repo/`.

## Build, Test, and Development Commands

- `npm install`: install dependencies.
- `npm run dev -- help`: run the CLI locally through `tsx`.
- `npm run build`: compile the CLI to `dist/` with `tsc`.
- `npm test`: run the full Vitest suite once.
- `npm run test:watch`: rerun Vitest during local iteration.

Run all commands from the repository root.

## Coding Style & Naming Conventions

Use TypeScript ESM with 2-space indentation and small focused modules. Name source files in `kebab-case.ts`, use `camelCase` for functions and variables, and `PascalCase` for types. Keep CLI commands verb-first and explicit, for example `profile import`, `profile apply`, and `profile rollback`. Store portable content as Markdown or YAML, and keep asset references repo-relative, such as `prompts/code-review.md`.

## Testing Guidelines

Vitest is the test runner. Add or update tests for every CLI behavior change, import/sync edge case, and apply/rollback path. Prefer temporary-directory fixtures over large static fixtures so expected repository state stays obvious in the test body. Before opening a PR, run `npm run build` and `npm test`.

## Commit & Pull Request Guidelines

Follow the existing Conventional Commit style: `feat:`, `fix:`, `docs:`, and `chore:`. Keep each commit scoped to one change, for example `feat: add profile rollback warnings`. Prefer short-lived topic branches from `main` for reviewable work. PRs should include a concise summary, linked strategy or PRD context when relevant, test evidence, and sample CLI output for user-visible command changes.

## Security & Configuration Tips

Do not commit personal `~/.myai/` data, secrets, or machine-specific config. Keep example MCP definitions and `CLAUDE.md` snippets sanitized. If a feature depends on environment variables or local config files, document the requirement in `README.md` and the relevant spec under `docs/specs/`.
