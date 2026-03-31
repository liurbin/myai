import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { applyProfile, rollbackProfile } from "../src/lib/apply.js";

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

async function writeProfileFixture(repoPath: string, options?: { missingPrompt?: boolean }): Promise<void> {
  await mkdir(path.join(repoPath, "profiles", "team"), { recursive: true });
  await mkdir(path.join(repoPath, "prompts"), { recursive: true });
  await mkdir(path.join(repoPath, "preferences"), { recursive: true });
  await mkdir(path.join(repoPath, "mcps"), { recursive: true });
  await mkdir(path.join(repoPath, "skills"), { recursive: true });

  await writeFile(path.join(repoPath, "prompts", "code-review.md"), "# Code review prompt\nBe concise.\n");
  await writeFile(path.join(repoPath, "preferences", "team-review-rules.md"), "# Team review rules\n");
  await writeFile(
    path.join(repoPath, "mcps", "github.yaml"),
    `version: 1\nkind: mcp\nname: github\ntransport: stdio\ncommand: npx\nargs:\n  - -y\n  - "@modelcontextprotocol/server-github"\n`,
  );
  await writeFile(path.join(repoPath, "skills", "review-pr"), "optional skill reference\n");

  if (!options?.missingPrompt) {
    await writeFile(path.join(repoPath, "prompts", "extra-context.md"), "# extra\n");
  }

  await writeFile(
    path.join(repoPath, "profiles", "team", "code-review.yaml"),
    `version: 1\nkind: profile\nname: Code Review\nslug: code-review\nscope: team\ndescription: Review pull requests with team rules and GitHub context\ntags:\n  - review\n  - backend\nassets:\n  prompts:\n    - prompts/code-review.md\n    - ${options?.missingPrompt ? "prompts/missing.md" : "prompts/extra-context.md"}\n  preferences:\n    - preferences/team-review-rules.md\n  mcps:\n    - mcps/github.yaml\n  skills:\n    - skills/review-pr\napply:\n  mode: merge\n  confirm: true\nsync:\n  source: claude-code\n  targets:\n    - codex\n`,
  );
}

async function findLogFile(repoPath: string, prefix: string): Promise<string> {
  const files = await readdir(path.join(repoPath, "logs"));
  const match = files.find((file) => file.startsWith(prefix));
  if (!match) {
    throw new Error(`Missing log file with prefix ${prefix}`);
  }
  return path.join(repoPath, "logs", match);
}

describe("applyProfile", () => {
  it("writes a preview and materializes a confirmed team profile into the target directory", async () => {
    const repoPath = await createTempDir("myai-apply-");
    const targetDir = await createTempDir("myai-target-");
    await writeProfileFixture(repoPath);

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const result = await applyProfile({
      repoPath,
      slug: "code-review",
      scope: "team",
      targetDir,
      runtime: {
        cwd: repoPath,
        env: { ...process.env, HOME: repoPath },
        stdout,
        stderr,
        stdin: { isTTY: false },
      },
      yes: true,
      eventName: "profile.apply",
    });

    expect(result.profile.slug).toBe("code-review");

    const previewFile = await findLogFile(repoPath, "preview-code-review-");
    const appliedFile = await findLogFile(repoPath, "applied-code-review-");
    const preview = await readFile(previewFile, "utf8");
    const applied = await readFile(appliedFile, "utf8");
    const materializedPrompt = await readFile(
      path.join(targetDir, ".myai-applied", "team", "code-review", "prompts", "code-review.md"),
      "utf8",
    );
    const materializedProfile = await readFile(
      path.join(targetDir, ".myai-applied", "team", "code-review", "profile.yaml"),
      "utf8",
    );
    const eventLog = await readFile(await findLogFile(repoPath, "events-"), "utf8");

    expect(result.targetPath).toBe(
      path.join(targetDir, ".myai-applied", "team", "code-review"),
    );
    expect(result.backupPath).toBeNull();
    expect(preview).toContain("# MyAI Profile Apply Preview");
    expect(preview).toContain("prompts/code-review.md");
    expect(preview).toContain("preferences/team-review-rules.md");
    expect(applied).toContain("# MyAI Profile Applied Bundle");
    expect(applied).toContain("Code review prompt");
    expect(materializedPrompt).toContain("Code review prompt");
    expect(materializedProfile).toContain("slug: code-review");
    expect(eventLog).toContain('"event":"profile.apply"');
    expect(eventLog).toContain('"status":"success"');
    expect(stdout.toString()).toBe("");
    expect(stderr.toString()).toBe("");
  });

  it("writes preview only and fails when referenced assets are missing", async () => {
    const repoPath = await createTempDir("myai-apply-missing-");
    const targetDir = await createTempDir("myai-target-");
    await writeProfileFixture(repoPath, { missingPrompt: true });

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    await expect(
      applyProfile({
        repoPath,
        slug: "code-review",
        scope: "team",
        targetDir,
        runtime: {
          cwd: repoPath,
          env: { ...process.env, HOME: repoPath },
          stdout,
          stderr,
          stdin: { isTTY: false },
        },
        yes: true,
        eventName: "profile.apply",
      }),
    ).rejects.toThrow(/Missing assets: prompts\/missing\.md/);

    const previewFile = await findLogFile(repoPath, "preview-code-review-");
    const preview = await readFile(previewFile, "utf8");
    const eventLog = await readFile(await findLogFile(repoPath, "events-"), "utf8");

    expect(preview).toContain("prompts/missing.md");
    expect(preview).toContain("_Missing asset reference_");
    expect(eventLog).toContain('"event":"profile.apply"');
    expect(eventLog).toContain('"status":"failure"');

    const files = await readdir(path.join(repoPath, "logs"));
    expect(files.some((file) => file.startsWith("applied-code-review-"))).toBe(false);
    await expect(
      readFile(
        path.join(targetDir, ".myai-applied", "team", "code-review", "prompts", "code-review.md"),
        "utf8",
      ),
    ).rejects.toThrow();
  });

  it("blocks non-interactive apply when --yes is not provided", async () => {
    const repoPath = await createTempDir("myai-apply-confirm-");
    const targetDir = await createTempDir("myai-target-");
    await writeProfileFixture(repoPath);

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    await expect(
      applyProfile({
        repoPath,
        slug: "code-review",
        scope: "team",
        targetDir,
        runtime: {
          cwd: repoPath,
          env: { ...process.env, HOME: repoPath },
          stdout,
          stderr,
          stdin: { isTTY: false },
        },
        yes: false,
        eventName: "profile.apply",
      }),
    ).rejects.toThrow(/requires confirmation/);

    const preview = await readFile(await findLogFile(repoPath, "preview-code-review-"), "utf8");
    const eventLog = await readFile(await findLogFile(repoPath, "events-"), "utf8");

    expect(preview).toContain("# MyAI Profile Apply Preview");
    expect(eventLog).toContain('"status":"failure"');
    expect(stdout.toString()).toBe("");
    expect(stderr.toString()).toBe("");
    await expect(
      readFile(
        path.join(targetDir, ".myai-applied", "team", "code-review", "profile.yaml"),
        "utf8",
      ),
    ).rejects.toThrow();
  });

  it("creates a backup before re-applying an existing materialized profile", async () => {
    const repoPath = await createTempDir("myai-apply-reapply-");
    const targetDir = await createTempDir("myai-target-");
    await writeProfileFixture(repoPath);

    const runtime = {
      cwd: repoPath,
      env: { ...process.env, HOME: repoPath },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    };

    await applyProfile({
      repoPath,
      slug: "code-review",
      scope: "team",
      targetDir,
      runtime,
      yes: true,
      eventName: "profile.apply",
    });

    const existingMaterializedPrompt = path.join(
      targetDir,
      ".myai-applied",
      "team",
      "code-review",
      "prompts",
      "code-review.md",
    );
    await writeFile(existingMaterializedPrompt, "# changed locally\n");

    const second = await applyProfile({
      repoPath,
      slug: "code-review",
      scope: "team",
      targetDir,
      runtime,
      yes: true,
      eventName: "profile.apply",
    });

    expect(second.backupPath).toBeTruthy();
    await expect(readFile(path.join(second.backupPath!, "prompts", "code-review.md"), "utf8")).resolves.toContain(
      "# changed locally",
    );
    await expect(readFile(existingMaterializedPrompt, "utf8")).resolves.toContain("Code review prompt");
  });

  it("restores the latest backup and preserves the current state as a new backup", async () => {
    const repoPath = await createTempDir("myai-rollback-");
    const targetDir = await createTempDir("myai-target-");
    await writeProfileFixture(repoPath);

    const runtime = {
      cwd: repoPath,
      env: { ...process.env, HOME: repoPath },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    };

    await applyProfile({
      repoPath,
      slug: "code-review",
      scope: "team",
      targetDir,
      runtime,
      yes: true,
      eventName: "profile.apply",
    });

    const existingMaterializedPrompt = path.join(
      targetDir,
      ".myai-applied",
      "team",
      "code-review",
      "prompts",
      "code-review.md",
    );
    await writeFile(existingMaterializedPrompt, "# changed locally\n");

    const second = await applyProfile({
      repoPath,
      slug: "code-review",
      scope: "team",
      targetDir,
      runtime,
      yes: true,
      eventName: "profile.apply",
    });

    const rollback = await rollbackProfile({
      repoPath,
      slug: "code-review",
      scope: "team",
      targetDir,
      runtime,
      yes: true,
    });

    expect(rollback.restoredFrom).toBe(second.backupPath);
    expect(rollback.backupPath).toBeTruthy();
    expect(rollback.backupPath).not.toBe(second.backupPath);
    await expect(readFile(existingMaterializedPrompt, "utf8")).resolves.toContain("# changed locally");
    await expect(readFile(path.join(rollback.backupPath!, "prompts", "code-review.md"), "utf8")).resolves.toContain(
      "Code review prompt",
    );
    await expect(readFile(await findLogFile(repoPath, "events-"), "utf8")).resolves.toContain('"event":"profile.rollback"');
  });

  it("fails rollback when no backup exists for the profile", async () => {
    const repoPath = await createTempDir("myai-rollback-none-");
    const targetDir = await createTempDir("myai-target-");
    await writeProfileFixture(repoPath);

    const runtime = {
      cwd: repoPath,
      env: { ...process.env, HOME: repoPath },
      stdout: new BufferWriter(),
      stderr: new BufferWriter(),
      stdin: { isTTY: false },
    };

    await applyProfile({
      repoPath,
      slug: "code-review",
      scope: "team",
      targetDir,
      runtime,
      yes: true,
      eventName: "profile.apply",
    });

    await expect(
      rollbackProfile({
        repoPath,
        slug: "code-review",
        scope: "team",
        targetDir,
        runtime,
        yes: true,
      }),
    ).rejects.toThrow(/No backup found/);

    await expect(
      readFile(
        path.join(targetDir, ".myai-applied", "team", "code-review", "prompts", "code-review.md"),
        "utf8",
      ),
    ).resolves.toContain("Code review prompt");
    await expect(readFile(await findLogFile(repoPath, "events-"), "utf8")).resolves.toContain(
      '"event":"profile.rollback"',
    );
    await expect(readFile(await findLogFile(repoPath, "events-"), "utf8")).resolves.toContain(
      '"status":"failure"',
    );
  });
});
