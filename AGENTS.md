# Repository Guidelines

## Project Structure & Module Organization

The repo is a TypeScript CLI plus product docs. Keep runtime code in `src/`, with command orchestration in `src/index.ts`, the executable shim in `src/cli.ts`, and domain logic in `src/lib/`. Store repository specs in `docs/specs/`, historical notes in `docs/archive/`, and demo fixtures in `examples/sample-repo/`. Put automated tests in `tests/`.

## Build, Test, and Development Commands

- `npm install`: install dependencies.
- `npm run dev -- help`: run the CLI locally through `tsx`.
- `npm run build`: compile `src/` with `tsc`.
- `npm test`: run the Vitest suite in watch mode.
- `./node_modules/.bin/vitest --run`: run the full test suite once for CI-style verification.

Run all commands from the repository root.

## Coding Style & Naming Conventions

Use TypeScript ESM with 2-space indentation and small single-purpose modules. Name source files in `kebab-case.ts`, use `camelCase` for functions and variables, and `PascalCase` for types. Keep CLI language verb-first and explicit, for example `profile apply` and `profile rollback`. Persist portable data as Markdown or YAML; repository asset paths should stay repo-relative, such as `prompts/code-review.md`.

## Testing Guidelines

Vitest is the test runner. Add or update tests for every CLI behavior change, import/sync edge case, and apply/rollback path. Name files `*.test.ts`. Prefer small temporary-directory fixtures over large static fixtures so expected repository state is obvious in the test body. Before a PR, run `npm run build` and `./node_modules/.bin/vitest --run`.

## Commit & Pull Request Guidelines

The repository currently has no published commit history, so start clean: use short imperative commit subjects such as `Add profile rollback command` or `Document backup layout`. PRs should include a concise summary, linked strategy/PRD context when relevant, test evidence, and sample CLI output for user-visible command changes.

## Security & Configuration Tips

Do not commit personal `~/.myai/` data, secrets, or machine-specific configs. Keep example MCP definitions and `CLAUDE.md` snippets sanitized. If a new feature depends on environment variables or local config files, document the requirement in `README.md` and the relevant spec under `docs/specs/`.
