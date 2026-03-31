# MyAI Examples

This directory contains a sample MyAI repository that matches the current v0.1 schema.

## Scenario

The sample repo models a small engineering team using:

- `Claude Code` as the source environment
- `Codex CLI` as the sync target

It includes:

- a team default profile
- a code review profile
- a personal debug profile
- prompt, preference, MCP, and skill assets

## Layout

```text
examples/sample-repo/
├── myai.yaml
├── prompts/
├── preferences/
├── mcps/
├── profiles/
└── skills/
```

## Intended Use

Use this example to:

- validate the repository schema by inspection
- copy a realistic starting point for pilot teams
- support docs, demos, and CLI tests
