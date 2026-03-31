import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { appendEventLog } from "../src/lib/logging.js";
import { formatReportSummary, summarizeEvents } from "../src/lib/reporting.js";
import { initRepository } from "../src/lib/repo.js";
import type { EventLogEntry } from "../src/types.js";

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createRepo(homeDir: string): Promise<string> {
  const repoPath = path.join(homeDir, ".myai");
  await initRepository(repoPath);
  return repoPath;
}

async function appendRepoEvent(
  repoPath: string,
  entry: EventLogEntry,
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<void> {
  await appendEventLog(repoPath, entry, {
    env: {
      ...process.env,
      MYAI_ACTOR_ID: "actor-alpha",
      MYAI_MACHINE_ID: "machine-alpha",
      ...envOverrides,
    },
  });
}

describe("reporting", () => {
  it("summarizes pilot metrics from local event logs", async () => {
    const homeDir = await createTempDir("myai-report-");
    const repoPath = await createRepo(homeDir);

    await appendRepoEvent(repoPath, {
      timestamp: "2026-03-01T09:00:00.000Z",
      event: "profile.import",
      profile: "code-review",
      scope: "team",
      source_tool: "claude-code",
      status: "success",
      duration_ms: 12,
    });
    await appendRepoEvent(repoPath, {
      timestamp: "2026-03-05T08:00:00.000Z",
      event: "profile.search",
      profile: "(search)",
      scope: "team",
      status: "success",
      query: "review",
      result_count: 1,
      matched_profiles: ["code-review"],
    });
    await appendRepoEvent(repoPath, {
      timestamp: "2026-03-05T09:00:00.000Z",
      event: "profile.apply",
      profile: "code-review",
      scope: "team",
      source_tool: "claude-code",
      target_tool: "codex",
      status: "success",
      duration_ms: 100,
    });
    await appendRepoEvent(repoPath, {
      timestamp: "2026-03-05T09:00:02.000Z",
      event: "profile.sync",
      profile: "code-review",
      scope: "team",
      source_tool: "claude-code",
      target_tool: "codex",
      status: "success",
      duration_ms: 30,
    });
    await appendRepoEvent(repoPath, {
      timestamp: "2026-03-08T11:00:00.000Z",
      event: "bootstrap",
      profile: "team-default",
      scope: "team",
      source_tool: "claude-code",
      target_tool: "codex",
      status: "partial_success",
      duration_ms: 120,
    });
    await appendRepoEvent(repoPath, {
      timestamp: "2026-03-10T08:30:00.000Z",
      event: "profile.sync",
      profile: "team-default",
      scope: "team",
      source_tool: "claude-code",
      target_tool: "codex",
      status: "partial_success",
      duration_ms: 15,
    });
    await appendRepoEvent(repoPath, {
      timestamp: "2026-03-12T10:00:00.000Z",
      event: "profile.rollback",
      profile: "code-review",
      scope: "team",
      source_tool: "claude-code",
      status: "success",
      duration_ms: 40,
    });
    await appendRepoEvent(
      repoPath,
      {
      timestamp: "2026-03-13T09:00:00.000Z",
      event: "profile.import",
      profile: "backend-debug",
      scope: "personal",
      source_tool: "claude-code",
      status: "success",
      duration_ms: 10,
      },
      { MYAI_ACTOR_ID: "actor-beta", MYAI_MACHINE_ID: "machine-beta" },
    );
    await appendRepoEvent(
      repoPath,
      {
        timestamp: "2026-03-14T09:00:00.000Z",
        event: "profile.search",
        profile: "(search)",
        scope: "team",
        status: "success",
        query: "nonexistent",
        result_count: 0,
        matched_profiles: [],
      },
      { MYAI_ACTOR_ID: "actor-beta", MYAI_MACHINE_ID: "machine-beta" },
    );
    await appendRepoEvent(
      repoPath,
      {
      timestamp: "2026-03-29T09:00:00.000Z",
      event: "profile.apply",
      profile: "backend-debug",
      scope: "personal",
      status: "failure",
      message: "Missing assets: prompts/missing.md",
      duration_ms: 20,
      },
      { MYAI_ACTOR_ID: "actor-beta", MYAI_MACHINE_ID: "machine-beta" },
    );

    const summary = await summarizeEvents({
      repoPath,
      since: "all",
      now: new Date("2026-03-30T12:00:00.000Z"),
    });

    expect(summary.repo_name).toBe("myai");
    expect(summary.total_events).toBe(10);
    expect(summary.unique_actors).toBe(2);
    expect(summary.unique_machines).toBe(2);
    expect(summary.created_profiles).toBe(2);
    expect(summary.reused_profiles).toBe(2);
    expect(summary.cross_tool_profiles).toBe(2);
    expect(summary.search_events).toBe(2);
    expect(summary.search_zero_result_events).toBe(1);
    expect(summary.eligible_searches_for_reuse_24h).toBe(1);
    expect(summary.searches_with_reuse_within_24h).toBe(1);
    expect(summary.search_to_reuse_within_24h_pct).toBe(100);
    expect(summary.eligible_imports_for_repeat_reuse_14d).toBe(2);
    expect(summary.reused_imports_within_14d).toBe(1);
    expect(summary.repeat_reuse_rate_14d_pct).toBe(50);
    expect(summary.median_restore_duration_ms).toBe(110);
    expect(summary.command_outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "profile.search",
          total: 2,
          success: 2,
          partial_success: 0,
          failure: 0,
        }),
        expect.objectContaining({
          event: "profile.import",
          total: 2,
          success: 2,
          partial_success: 0,
          failure: 0,
        }),
        expect.objectContaining({
          event: "profile.apply",
          total: 2,
          success: 1,
          partial_success: 0,
          failure: 1,
          avg_duration_ms: 60,
          median_duration_ms: 60,
        }),
        expect.objectContaining({
          event: "profile.sync",
          total: 2,
          success: 1,
          partial_success: 1,
          failure: 0,
        }),
      ]),
    );
    expect(summary.weekly_reused_profiles).toEqual([
      { week_start: "2026-03-02", reused_profiles: 2, reuse_events: 3 },
      { week_start: "2026-03-09", reused_profiles: 1, reuse_events: 1 },
    ]);
    expect(summary.top_profiles).toEqual([
      {
        profile: "code-review",
        reuse_events: 2,
        profile_apply_events: 1,
        bootstrap_events: 0,
        profile_sync_events: 1,
      },
      {
        profile: "team-default",
        reuse_events: 2,
        profile_apply_events: 0,
        bootstrap_events: 1,
        profile_sync_events: 1,
      },
    ]);
    expect(summary.recent_failures).toEqual([
      {
        timestamp: "2026-03-29T09:00:00.000Z",
        event: "profile.apply",
        profile: "backend-debug",
        message: "Missing assets: prompts/missing.md",
      },
    ]);

    const formatted = formatReportSummary(summary);
    expect(formatted).toContain("# MyAI Pilot Summary");
    expect(formatted).toContain("repo_name: myai");
    expect(formatted).toContain("unique_actors: 2");
    expect(formatted).toContain("search_to_reuse_within_24h_pct: 100");
    expect(formatted).toContain("repeat_reuse_rate_14d_pct: 50");
    expect(formatted).toContain("## Recent Failures");
  });
});
