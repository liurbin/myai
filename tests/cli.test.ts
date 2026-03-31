import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "../src/index.js";

class BufferWriter {
  chunks: string[] = [];

  write(chunk: string): void {
    this.chunks.push(chunk);
  }

  toString(): string {
    return this.chunks.join("");
  }
}

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function findLogFile(repoPath: string, prefix: string): Promise<string> {
  const files = await readdir(path.join(repoPath, "logs"));
  const match = files.find((file) => file.startsWith(prefix));
  if (!match) {
    throw new Error(`Missing log file with prefix ${prefix}`);
  }

  return path.join(repoPath, "logs", match);
}

async function readEvents(repoPath: string): Promise<Array<Record<string, unknown>>> {
  const log = await readFile(await findLogFile(repoPath, "events-"), "utf8");
  return log
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function writeProfileFixture(
  repoPath: string,
  scope: "team" | "personal" = "team",
  options?: { missingPrompt?: boolean },
): Promise<void> {
  await mkdir(path.join(repoPath, "profiles", scope), { recursive: true });
  await mkdir(path.join(repoPath, "prompts"), { recursive: true });
  await mkdir(path.join(repoPath, "preferences"), { recursive: true });
  await mkdir(path.join(repoPath, "mcps"), { recursive: true });
  await mkdir(path.join(repoPath, "skills"), { recursive: true });

  if (!options?.missingPrompt) {
    await writeFile(path.join(repoPath, "prompts", "code-review.md"), "# Code review prompt\nBe concise.\n");
  }
  await writeFile(path.join(repoPath, "preferences", "team-review-rules.md"), "# Team review rules\n");
  await writeFile(
    path.join(repoPath, "mcps", "github.yaml"),
    `version: 1\nkind: mcp\nname: github\ntransport: stdio\ncommand: npx\nargs:\n  - -y\n  - "@modelcontextprotocol/server-github"\n`,
  );
  await writeFile(path.join(repoPath, "skills", "review-pr"), "optional skill reference\n");
  await writeFile(
    path.join(repoPath, "profiles", scope, "code-review.yaml"),
    `version: 1\nkind: profile\nname: Code Review\nslug: code-review\nscope: ${scope}\nassets:\n  prompts:\n    - prompts/code-review.md\n  preferences:\n    - preferences/team-review-rules.md\n  mcps:\n    - mcps/github.yaml\n  skills:\n    - skills/review-pr\napply:\n  mode: merge\n  confirm: true\nsync:\n  source: claude-code\n  targets:\n    - codex\n`,
  );
}

describe("myai cli", () => {
  it("initializes a repository", async () => {
    const repoDir = await createTempDir("myai-repo-");
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const code = await runCli(["init", repoDir], {
      cwd: repoDir,
      env: { ...process.env, HOME: repoDir },
      stdout,
      stderr,
      stdin: { isTTY: false },
    });

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("Initialized MyAI repository");
    await expect(readFile(path.join(repoDir, "myai.yaml"), "utf8")).resolves.toContain("version: 1");
  });

  it("prints help when no arguments are provided", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const code = await runCli([], {
      cwd: process.cwd(),
      env: process.env,
      stdout,
      stderr,
      stdin: { isTTY: false },
    });

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("Usage: myai <init|profile|bootstrap|report|help> [...args]");
    expect(stdout.toString()).toContain(
      "myai profile apply <slug> [--scope team|personal] [--target-dir path] [--target-config path] [--yes] [--verbose]",
    );
    expect(stdout.toString()).toContain(
      "myai report summary [--since 14d|all|YYYY-MM-DD] [--format text|json]",
    );
    expect(stdout.toString()).toContain(
      "myai bootstrap <slug> [--scope team|personal] [--target-dir path] [--target-config path] [--yes] [--verbose]",
    );
    expect(stderr.toString()).toBe("");
  });

  it("includes rollback in profile help", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const code = await runCli(["profile", "help"], {
      cwd: process.cwd(),
      env: process.env,
      stdout,
      stderr,
      stdin: { isTTY: false },
    });

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("rollback");
    expect(stderr.toString()).toBe("");
  });

  it("shows sync support for a profile", async () => {
    const homeDir = await createTempDir("myai-home-");
    const repoDir = path.join(homeDir, ".myai");

    await runCli(["init"], {
      cwd: homeDir,
      env: { ...process.env, HOME: homeDir },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    });

    await writeProfileFixture(repoDir);

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();
    const code = await runCli(["profile", "show", "code-review"], {
      cwd: repoDir,
      env: { ...process.env, HOME: homeDir },
      stdout,
      stderr,
      stdin: { isTTY: false },
    });

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("sync.source: claude-code");
    expect(stdout.toString()).toContain("sync.targets: codex");
    expect(stderr.toString()).toBe("");
  });

  it("imports a Claude profile from CLAUDE.md and ~/.claude.json", async () => {
    const homeDir = await createTempDir("myai-home-");
    const repoDir = path.join(homeDir, ".myai");
    const sourceDir = await createTempDir("myai-source-");

    await runCli(["init"], {
      cwd: sourceDir,
      env: { ...process.env, HOME: homeDir },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    });

    await writeFile(path.join(sourceDir, "CLAUDE.md"), "# Team review rules\n");
    await mkdir(path.join(sourceDir, ".claude"), { recursive: true });
    await writeFile(path.join(sourceDir, ".claude", "settings.local.json"), JSON.stringify({ permissions: {} }));
    await writeFile(
      path.join(homeDir, ".claude.json"),
      JSON.stringify({
        projects: {
          [sourceDir]: {
            mcpServers: {
              github: {
                type: "stdio",
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-github"],
                env: { GITHUB_TOKEN: "token" },
              },
            },
          },
        },
      }),
    );

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();
    const code = await runCli(["profile", "import", "code-review", "--from", "claude-code"], {
      cwd: sourceDir,
      env: { ...process.env, HOME: homeDir },
      stdout,
      stderr,
      stdin: { isTTY: false },
    });

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("Reads: CLAUDE.md and matching project mcpServers from ~/.claude.json.");
    await expect(
      readFile(path.join(repoDir, "profiles", "team", "code-review.yaml"), "utf8"),
    ).resolves.toContain("slug: code-review");
    await expect(readFile(path.join(repoDir, "mcps", "github.yaml"), "utf8")).resolves.toContain("kind: mcp");
    expect(stderr.toString()).toContain("Ignored .claude/settings.local.json");
  });

  it("derives an import slug from the source directory when omitted", async () => {
    const homeDir = await createTempDir("myai-home-");
    const repoDir = path.join(homeDir, ".myai");
    const sourceRoot = await createTempDir("myai-source-root-");
    const sourceDir = path.join(sourceRoot, "backend-review");

    await mkdir(sourceDir, { recursive: true });
    await runCli(["init"], {
      cwd: homeDir,
      env: { ...process.env, HOME: homeDir },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    });

    await writeFile(path.join(sourceDir, "CLAUDE.md"), "# Backend review rules\n");
    await writeFile(
      path.join(homeDir, ".claude.json"),
      JSON.stringify({
        projects: {
          [sourceDir]: {
            mcpServers: {},
          },
        },
      }),
    );

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();
    const code = await runCli(["profile", "import", "--from", "claude-code"], {
      cwd: sourceDir,
      env: { ...process.env, HOME: homeDir },
      stdout,
      stderr,
      stdin: { isTTY: false },
    });

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("Imported profile 'backend-review'");
    expect(stdout.toString()).toContain("Derived slug: backend-review");
    await expect(
      readFile(path.join(repoDir, "profiles", "team", "backend-review.yaml"), "utf8"),
    ).resolves.toContain("slug: backend-review");
    expect(stderr.toString()).toBe("");
  });

  it("syncs MCP assets to a Codex config file", async () => {
    const homeDir = await createTempDir("myai-home-");
    const repoDir = path.join(homeDir, ".myai");

    await runCli(["init"], {
      cwd: homeDir,
      env: { ...process.env, HOME: homeDir },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    });

    await writeFile(
      path.join(repoDir, "mcps", "github.yaml"),
      `version: 1\nkind: mcp\nname: github\ntransport: stdio\ncommand: npx\nargs:\n  - -y\n  - "@modelcontextprotocol/server-github"\n`,
    );
    await writeFile(
      path.join(repoDir, "profiles", "team", "code-review.yaml"),
      `version: 1\nkind: profile\nname: Code Review\nslug: code-review\nscope: team\nassets:\n  prompts: []\n  preferences: []\n  mcps:\n    - mcps/github.yaml\n  skills: []\napply:\n  mode: merge\n  confirm: true\nsync:\n  source: claude-code\n  targets:\n    - codex\n`,
    );

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();
    const targetConfigPath = path.join(homeDir, ".codex", "config.toml");
    const code = await runCli(
      ["profile", "sync", "code-review", "--to", "codex", "--target-config", targetConfigPath],
      {
        cwd: repoDir,
        env: { ...process.env, HOME: homeDir },
        stdout,
        stderr,
        stdin: { isTTY: false },
      },
    );

    expect(code).toBe(0);
    await expect(readFile(targetConfigPath, "utf8")).resolves.toContain("[mcp_servers.github]");
    expect(stdout.toString()).toContain("Synced profile 'code-review'");
  });

  it("reports repo-local pilot metrics as JSON", async () => {
    const homeDir = await createTempDir("myai-home-");
    const repoDir = path.join(homeDir, ".myai");
    const targetDir = await createTempDir("myai-target-");
    const targetConfigPath = path.join(homeDir, ".codex", "config.toml");
    const env = {
      ...process.env,
      HOME: homeDir,
      MYAI_ACTOR_ID: "pilot-user",
      MYAI_MACHINE_ID: "pilot-machine",
    };

    await runCli(["init"], {
      cwd: homeDir,
      env,
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    });

    await writeProfileFixture(repoDir);

    const searchStdout = new BufferWriter();
    const searchStderr = new BufferWriter();
    const searchCode = await runCli(["profile", "search", "review"], {
      cwd: repoDir,
      env,
      stdout: searchStdout,
      stderr: searchStderr,
      stdin: { isTTY: false },
    });

    expect(searchCode).toBe(0);
    expect(searchStdout.toString()).toContain("code-review");
    expect(searchStderr.toString()).toBe("");

    await runCli(
      ["profile", "apply", "code-review", "--target-dir", targetDir, "--target-config", targetConfigPath, "--yes"],
      {
        cwd: repoDir,
        env,
        stdout: new BufferWriter(),
        stderr: new BufferWriter(),
        stdin: { isTTY: false },
      },
    );

    const events = await readEvents(repoDir);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "profile.search",
          profile: "(search)",
          scope: "team",
          query: "review",
          result_count: 1,
          matched_profiles: ["code-review"],
          actor_id: "pilot-user",
          machine_id: "pilot-machine",
          repo_name: "myai",
        }),
      ]),
    );

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();
    const code = await runCli(["report", "summary", "--since", "all", "--format", "json"], {
      cwd: repoDir,
      env,
      stdout,
      stderr,
      stdin: { isTTY: false },
    });

    const summary = JSON.parse(stdout.toString()) as {
      repo_name: string;
      total_events: number;
      unique_actors: number;
      unique_machines: number;
      created_profiles: number;
      reused_profiles: number;
      cross_tool_profiles: number;
      search_events: number;
      search_zero_result_events: number;
      eligible_searches_for_reuse_24h: number;
      searches_with_reuse_within_24h: number;
      search_to_reuse_within_24h_pct: number | null;
      median_restore_duration_ms: number | null;
      command_outcomes: Array<Record<string, unknown>>;
    };

    expect(code).toBe(0);
    expect(summary.repo_name).toBe("myai");
    expect(summary.total_events).toBe(3);
    expect(summary.unique_actors).toBe(1);
    expect(summary.unique_machines).toBe(1);
    expect(summary.created_profiles).toBe(0);
    expect(summary.reused_profiles).toBe(1);
    expect(summary.cross_tool_profiles).toBe(1);
    expect(summary.search_events).toBe(1);
    expect(summary.search_zero_result_events).toBe(0);
    expect(summary.eligible_searches_for_reuse_24h).toBe(1);
    expect(summary.searches_with_reuse_within_24h).toBe(1);
    expect(summary.search_to_reuse_within_24h_pct).toBe(100);
    expect(summary.median_restore_duration_ms).not.toBeNull();
    expect(summary.command_outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "profile.search",
          total: 1,
          success: 1,
          partial_success: 0,
          failure: 0,
        }),
        expect.objectContaining({
          event: "profile.apply",
          total: 1,
          partial_success: 1,
          failure: 0,
        }),
        expect.objectContaining({
          event: "profile.sync",
          total: 1,
          partial_success: 1,
          failure: 0,
        }),
      ]),
    );
    expect(stderr.toString()).toBe("");
  });

  it("applies a profile and restores supported Codex config", async () => {
    const homeDir = await createTempDir("myai-home-");
    const repoDir = path.join(homeDir, ".myai");
    const targetDir = await createTempDir("myai-target-");
    const targetConfigPath = path.join(homeDir, ".codex-custom", "config.toml");

    await runCli(["init"], {
      cwd: homeDir,
      env: { ...process.env, HOME: homeDir },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    });

    await writeProfileFixture(repoDir);

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();
    const code = await runCli(
      ["profile", "apply", "code-review", "--target-dir", targetDir, "--target-config", targetConfigPath, "--yes"],
      {
        cwd: repoDir,
        env: { ...process.env, HOME: homeDir },
        stdout,
        stderr,
        stdin: { isTTY: false },
      },
    );

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("Applied profile 'code-review'");
    expect(stdout.toString()).toContain("Materialized to:");
    expect(stdout.toString()).toContain("Codex config synced.");
    expect(stdout.toString()).not.toContain("Preview:");
    expect(stdout.toString()).not.toContain("Rendered bundle:");
    expect(stdout.toString()).not.toContain(`Codex config: ${targetConfigPath}`);
    expect(stdout.toString()).not.toContain("Synced MCP servers: github");
    expect(stderr.toString()).toContain("Warning: Skill reference");
    await expect(
      readFile(path.join(targetDir, ".myai-applied", "team", "code-review", "profile.yaml"), "utf8"),
    ).resolves.toContain("slug: code-review");
    await expect(readFile(targetConfigPath, "utf8")).resolves.toContain("[mcp_servers.github]");
    await expect(readFile(await findLogFile(repoDir, "preview-code-review-"), "utf8")).resolves.toContain(
      "## MyAI Codex Sync Preview",
    );

    const events = await readEvents(repoDir);
    const applyEvents = events.filter((entry) => entry.event === "profile.apply");
    const syncEvents = events.filter((entry) => entry.event === "profile.sync");

    expect(applyEvents).toHaveLength(1);
    expect(syncEvents).toHaveLength(1);
    expect(applyEvents[0]).toMatchObject({
      event: "profile.apply",
      profile: "code-review",
      target_tool: "codex",
      status: "partial_success",
    });
  });

  it("shows apply detail paths in verbose mode", async () => {
    const homeDir = await createTempDir("myai-home-");
    const repoDir = path.join(homeDir, ".myai");
    const targetDir = await createTempDir("myai-target-");
    const targetConfigPath = path.join(homeDir, ".codex-custom", "config.toml");

    await runCli(["init"], {
      cwd: homeDir,
      env: { ...process.env, HOME: homeDir },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    });

    await writeProfileFixture(repoDir);

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();
    const code = await runCli(
      [
        "profile",
        "apply",
        "code-review",
        "--target-dir",
        targetDir,
        "--target-config",
        targetConfigPath,
        "--yes",
        "--verbose",
      ],
      {
        cwd: repoDir,
        env: { ...process.env, HOME: homeDir },
        stdout,
        stderr,
        stdin: { isTTY: false },
      },
    );

    expect(code).toBe(0);
    expect(stdout.toString()).toContain(`Codex config: ${targetConfigPath}`);
    expect(stdout.toString()).toContain("Synced MCP servers: github");
    expect(stdout.toString()).toContain("Preview:");
    expect(stdout.toString()).toContain("Rendered bundle:");
    expect(stderr.toString()).toContain("Warning: Skill reference");
  });

  it("records apply failure when Codex preview validation fails", async () => {
    const homeDir = await createTempDir("myai-home-");
    const repoDir = path.join(homeDir, ".myai");
    const targetDir = await createTempDir("myai-target-");

    await runCli(["init"], {
      cwd: homeDir,
      env: { ...process.env, HOME: homeDir },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    });

    await writeProfileFixture(repoDir, "team", { missingPrompt: true });

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();
    const code = await runCli(["profile", "apply", "code-review", "--target-dir", targetDir, "--yes"], {
      cwd: repoDir,
      env: { ...process.env, HOME: homeDir },
      stdout,
      stderr,
      stdin: { isTTY: false },
    });

    expect(code).toBe(1);
    expect(stdout.toString()).toBe("");
    expect(stderr.toString()).toContain("Error: Profile 'code-review' has missing asset references:");

    const events = await readEvents(repoDir);
    const applyEvents = events.filter((entry) => entry.event === "profile.apply");
    const syncEvents = events.filter((entry) => entry.event === "profile.sync");

    expect(applyEvents).toHaveLength(1);
    expect(syncEvents).toHaveLength(0);
    expect(applyEvents[0]).toMatchObject({
      event: "profile.apply",
      profile: "code-review",
      target_tool: "codex",
      status: "failure",
    });
  });

  it("rolls back a reapplied profile via the CLI", async () => {
    const homeDir = await createTempDir("myai-home-");
    const repoDir = path.join(homeDir, ".myai");
    const targetDir = await createTempDir("myai-target-");

    await runCli(["init"], {
      cwd: homeDir,
      env: { ...process.env, HOME: homeDir },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    });

    await writeProfileFixture(repoDir);

    await runCli(["profile", "apply", "code-review", "--target-dir", targetDir, "--yes"], {
      cwd: repoDir,
      env: { ...process.env, HOME: homeDir },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    });

    const materializedPrompt = path.join(
      targetDir,
      ".myai-applied",
      "team",
      "code-review",
      "prompts",
      "code-review.md",
    );
    await writeFile(materializedPrompt, "# changed locally\n");

    await runCli(["profile", "apply", "code-review", "--target-dir", targetDir, "--yes"], {
      cwd: repoDir,
      env: { ...process.env, HOME: homeDir },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    });

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();
    const code = await runCli(["profile", "rollback", "code-review", "--target-dir", targetDir, "--yes"], {
      cwd: repoDir,
      env: { ...process.env, HOME: homeDir },
      stdout,
      stderr,
      stdin: { isTTY: false },
    });

    expect(code).toBe(0);
    await expect(readFile(materializedPrompt, "utf8")).resolves.toContain("# changed locally");
    expect(stdout.toString()).toContain("Rolled back profile 'code-review'");
    expect(stdout.toString()).toContain("Restored from:");
    expect(stderr.toString()).toBe("");
  });

  it("bootstraps an explicitly selected personal profile", async () => {
    const homeDir = await createTempDir("myai-home-");
    const repoDir = path.join(homeDir, ".myai");
    const targetDir = await createTempDir("myai-target-");

    await runCli(["init"], {
      cwd: homeDir,
      env: { ...process.env, HOME: homeDir },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    });

    await writeProfileFixture(repoDir, "personal");

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();
    const code = await runCli(["bootstrap", "code-review", "--scope", "personal", "--target-dir", targetDir, "--yes"], {
      cwd: repoDir,
      env: { ...process.env, HOME: homeDir },
      stdout,
      stderr,
      stdin: { isTTY: false },
    });

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("Bootstrapped personal profile 'code-review'");
    expect(stdout.toString()).toContain("Codex config synced.");
    expect(stdout.toString()).not.toContain("Preview:");
    await expect(
      readFile(path.join(targetDir, ".myai-applied", "personal", "code-review", "profile.yaml"), "utf8"),
    ).resolves.toContain("scope: personal");
    await expect(readFile(path.join(homeDir, ".codex", "config.toml"), "utf8")).resolves.toContain(
      "[mcp_servers.github]",
    );
    expect(stderr.toString()).toContain("Warning: Skill reference");
    await expect(readFile(await findLogFile(repoDir, "preview-code-review-"), "utf8")).resolves.toContain(
      "## MyAI Codex Sync Preview",
    );
    const bootstrapLog = await readFile(await findLogFile(repoDir, "events-"), "utf8");
    expect((bootstrapLog.match(/"event":"bootstrap"/g) ?? []).length).toBe(1);
    expect(bootstrapLog).toContain('"target_tool":"codex"');
    expect(bootstrapLog).toContain('"status":"partial_success"');
  });

  it("records bootstrap failure when apply validation fails", async () => {
    const homeDir = await createTempDir("myai-home-");
    const repoDir = path.join(homeDir, ".myai");
    const targetDir = await createTempDir("myai-target-");

    await runCli(["init"], {
      cwd: homeDir,
      env: { ...process.env, HOME: homeDir },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    });

    await writeProfileFixture(repoDir, "team", { missingPrompt: true });

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();
    const code = await runCli(["bootstrap", "code-review", "--target-dir", targetDir, "--yes"], {
      cwd: repoDir,
      env: { ...process.env, HOME: homeDir },
      stdout,
      stderr,
      stdin: { isTTY: false },
    });

    expect(code).toBe(1);
    expect(stdout.toString()).toBe("");
    expect(stderr.toString()).toContain("Error: Profile 'code-review' has missing asset references:");
    const eventLog = await readFile(await findLogFile(repoDir, "events-"), "utf8");
    expect((eventLog.match(/"event":"bootstrap"/g) ?? []).length).toBe(1);
    expect(eventLog).toContain('"status":"failure"');
    expect(eventLog).toContain("Profile 'code-review' has missing asset references: prompts/code-review.md.");
  });
});
