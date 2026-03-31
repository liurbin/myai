import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { syncProfileToCodex } from "../src/lib/codex.js";
import { loadProfile } from "../src/lib/profile-store.js";
import { initRepository } from "../src/lib/repo.js";

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createRepo(homeDir: string): Promise<string> {
  const repoPath = path.join(homeDir, ".myai");
  await initRepository(repoPath);
  return repoPath;
}

async function findLogFile(repoPath: string, prefix: string): Promise<string> {
  const files = await readdir(path.join(repoPath, "logs"));
  const match = files.find((file) => file.startsWith(prefix));
  if (!match) {
    throw new Error(`Missing log file with prefix ${prefix}`);
  }

  return path.join(repoPath, "logs", match);
}

async function writeSyncFixture(repoPath: string, options?: { missingPrompt?: boolean }): Promise<void> {
  await mkdir(path.join(repoPath, "profiles", "team"), { recursive: true });
  await mkdir(path.join(repoPath, "prompts"), { recursive: true });
  await mkdir(path.join(repoPath, "preferences"), { recursive: true });
  await mkdir(path.join(repoPath, "mcps"), { recursive: true });

  if (!options?.missingPrompt) {
    await writeFile(path.join(repoPath, "prompts", "code-review.md"), "# Code review prompt\n");
  }
  await writeFile(path.join(repoPath, "preferences", "team-review-rules.md"), "# Team rules\n");
  await writeFile(
    path.join(repoPath, "mcps", "github.yaml"),
    `version: 1\nkind: mcp\nname: github\ntransport: stdio\ncommand: npx\nargs:\n  - -y\n  - "@modelcontextprotocol/server-github"\n`,
  );
  await writeFile(
    path.join(repoPath, "profiles", "team", "code-review.yaml"),
    `version: 1\nkind: profile\nname: Code Review\nslug: code-review\nscope: team\nassets:\n  prompts:\n    - prompts/code-review.md\n  preferences:\n    - preferences/team-review-rules.md\n  mcps:\n    - mcps/github.yaml\n  skills: []\napply:\n  mode: merge\n  confirm: true\nsync:\n  source: claude-code\n  targets:\n    - codex\n`,
  );
}

describe("Codex sync", () => {
  it("treats prompt and preference assets as supported repo-local context, not partial warnings", async () => {
    const homeDir = await makeTempDir("myai-home-");
    const repoPath = await createRepo(homeDir);
    await writeSyncFixture(repoPath);

    const targetConfigPath = path.join(homeDir, ".codex", "config.toml");
    const result = await syncProfileToCodex({
      repoPath,
      slug: "code-review",
      homeDir,
      targetConfigPath,
    });

    expect(result.status).toBe("success");
    expect(result.warnings).toEqual([]);
    expect(result.syncedServers).toEqual(["github"]);
    await expect(readFile(targetConfigPath, "utf8")).resolves.toContain("[mcp_servers.github]");
    await expect(readFile(await findLogFile(repoPath, "events-"), "utf8")).resolves.toContain('"status":"success"');
  });

  it("fails sync when the profile contains missing asset references and records a failure event", async () => {
    const homeDir = await makeTempDir("myai-home-");
    const repoPath = await createRepo(homeDir);
    await writeSyncFixture(repoPath, { missingPrompt: true });

    await expect(
      syncProfileToCodex({
        repoPath,
        slug: "code-review",
        homeDir,
        targetConfigPath: path.join(homeDir, ".codex", "config.toml"),
      }),
    ).rejects.toThrow(/missing asset references: prompts\/code-review\.md/);

    await expect(readFile(await findLogFile(repoPath, "events-"), "utf8")).resolves.toContain('"event":"profile.sync"');
    await expect(readFile(await findLogFile(repoPath, "events-"), "utf8")).resolves.toContain('"status":"failure"');
  });

  it("rejects profiles whose filename does not match the slug", async () => {
    const homeDir = await makeTempDir("myai-home-");
    const repoPath = await createRepo(homeDir);

    await mkdir(path.join(repoPath, "profiles", "team"), { recursive: true });
    await writeFile(
      path.join(repoPath, "profiles", "team", "code-review.yaml"),
      `version: 1\nkind: profile\nname: Bad Profile\nslug: different-slug\nscope: team\nassets:\n  prompts: []\n  preferences: []\n  mcps: []\n  skills: []\napply:\n  mode: merge\n  confirm: true\n`,
    );

    await expect(loadProfile(repoPath, "code-review", "team")).rejects.toThrow(
      "Profile filename 'code-review' must match slug 'different-slug'.",
    );
  });
});
