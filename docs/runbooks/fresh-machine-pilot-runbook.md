# Fresh Machine Pilot Runbook

## Purpose

Use this runbook to validate a new machine or new teammate flow with the current v0.1 CLI.
It assumes the repository already contains at least one `profile` that can be applied locally, and ideally one profile with `sync.targets: [codex]`.

## Prerequisites

- Node.js 18+
- A built MyAI checkout
- A local MyAI repo at `~/.myai` or another repo path
- A writable target directory for materialized state

## Recommended Demo Setup

Use the sample repository for the first pass:

```bash
export MYAI_ACTOR_ID=pilot-operator-1
export MYAI_MACHINE_ID=pilot-machine-01

cd /Users/eddie/projects/github/myai/examples/sample-repo
node ../../dist/cli.js profile list
node ../../dist/cli.js profile show code-review
```

Expected result:

- `profile list` shows `team-default`, `code-review`, and `eddie-debug`
- `profile show` displays asset references and `sync.targets: codex`

## Pilot Flow

1. Initialize a clean repo if needed:

```bash
node /Users/eddie/projects/github/myai/dist/cli.js init
```

2. Verify the imported profiles:

```bash
node /Users/eddie/projects/github/myai/dist/cli.js profile search review
```

3. Apply a team profile into a fresh target directory:

```bash
node /Users/eddie/projects/github/myai/dist/cli.js profile apply code-review \
  --target-dir /tmp/myai-pilot \
  --target-config /tmp/myai-codex.toml \
  --yes
```

4. Confirm the materialized state exists:

- `/tmp/myai-pilot/.myai-applied/team/code-review/profile.yaml`
- `/tmp/myai-pilot/.myai-applied/team/code-review/prompts/code-review.md`
- `logs/preview-*.md` inside the MyAI repository

5. Confirm Codex config was synced:

- `/tmp/myai-codex.toml`
- `node /Users/eddie/projects/github/myai/dist/cli.js profile sync code-review --to codex`

6. Test rollback after a local edit:

```bash
echo "# changed locally" > /tmp/myai-pilot/.myai-applied/team/code-review/prompts/code-review.md
node /Users/eddie/projects/github/myai/dist/cli.js profile rollback code-review \
  --target-dir /tmp/myai-pilot \
  --yes
```

7. Bootstrapping should follow the same restore path:

```bash
node /Users/eddie/projects/github/myai/dist/cli.js bootstrap code-review \
  --target-dir /tmp/myai-pilot-bootstrap \
  --target-config /tmp/myai-bootstrap-codex.toml \
  --yes
```

8. Capture the repo-local pilot summary:

```bash
node /Users/eddie/projects/github/myai/dist/cli.js report summary --since all
```

Expected summary fields to inspect:

- `unique_actors`
- `unique_machines`
- `search_events`
- `search_zero_result_events`
- `search_to_reuse_within_24h_pct`

## What To Record

- Time to first usable profile
- Actor and machine identifiers used for the run
- Whether a Codex config was restored successfully
- Any warnings shown during `apply` or `sync`
- Whether rollback restored the last backup correctly
- Whether the team profile could be reused without manual edits
- Whether a search led to reuse within 24 hours

## Current Limits

- Only `Claude Code -> Codex CLI` sync is supported
- `skills` are lightly supported and may emit warnings
- The CLI writes local structured logs only; no hosted analytics layer exists yet
