# MyAI Project Guidelines

## What is this?

MyAI is a personal AI capability vault — accumulate, manage, and sync your AI assets (prompts, skills, MCPs, preferences) across all AI tools.

## Tech Stack

- TypeScript + Node.js
- MCP Server (Model Context Protocol)
- Standard formats: Markdown + YAML
- Git for storage and sync

## Key Decisions

- Local-first: all data in `~/.myai/`, no cloud dependency
- AI-native: management through natural language, not config editing
- Multi-form: GPT, Claude Project, MCP Server, CLI, browser extension — same vault backend
- Standard formats: SKILL.md (agentskills.io), YAML for MCP configs

## Development

- Branch: work on `main` (this is a new project, no uat/master split yet)
- Commits: clear messages explaining what and why
- Tests: write tests for format adapters (JSON/YAML/TOML conversion)

## Architecture

See `IDEA.md` for the full product idea and architecture diagrams.
