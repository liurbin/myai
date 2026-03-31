import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { importClaudeCodeProfile } from "../src/lib/claude.js";
import { initRepository } from "../src/lib/repo.js";

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createRepo(homeDir: string): Promise<string> {
  const repoPath = path.join(homeDir, ".myai");
  await initRepository(repoPath);
  return repoPath;
}

describe("Claude import", () => {
  it("imports CLAUDE.md and supported MCP servers while warning about ignored local settings", async () => {
    const homeDir = await makeTempDir("myai-home-");
    const repoPath = await createRepo(homeDir);
    const sourceDir = await makeTempDir("myai-source-");

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

    const result = await importClaudeCodeProfile({
      repoPath,
      slug: "code-review",
      scope: "team",
      sourceDir,
      homeDir,
    });

    expect(result.profile.slug).toBe("code-review");
    expect(result.importedAssets).toContain("preferences/code-review-claude.md");
    expect(result.importedAssets).toContain("mcps/github.yaml");
    expect(result.warnings).toContain(
      "Ignored .claude/settings.local.json because v0.1 does not map local Claude permissions.",
    );

    await expect(readFile(path.join(repoPath, "profiles", "team", "code-review.yaml"), "utf8")).resolves.toContain(
      "slug: code-review",
    );
    await expect(readFile(path.join(repoPath, "mcps", "github.yaml"), "utf8")).resolves.toContain("kind: mcp");
  });

  it("resolves Claude project entries via realpath when the source directory is a symlink", async () => {
    const homeDir = await makeTempDir("myai-home-");
    const repoPath = await createRepo(homeDir);
    const actualSourceDir = await makeTempDir("myai-actual-source-");
    const linkedSourceDir = path.join(homeDir, "linked-source");

    await symlink(actualSourceDir, linkedSourceDir);
    await writeFile(path.join(actualSourceDir, "CLAUDE.md"), "# Real path content\n");
    await writeFile(
      path.join(homeDir, ".claude.json"),
      JSON.stringify({
        projects: {
          [actualSourceDir]: {
            mcpServers: {
              context7: {
                type: "stdio",
                command: "npx",
                args: ["-y", "@upstash/context7-mcp@latest"],
              },
            },
          },
        },
      }),
    );

    const result = await importClaudeCodeProfile({
      repoPath,
      slug: "backend-debug",
      scope: "team",
      sourceDir: linkedSourceDir,
      homeDir,
    });

    expect(result.importedAssets).toContain("preferences/backend-debug-claude.md");
    expect(result.importedAssets).toContain("mcps/context7.yaml");
    expect(result.warnings).not.toContain(
      "No Claude project MCP servers were found in ~/.claude.json for the selected source directory.",
    );
  });

  it("skips malformed MCP entries but still imports valid ones", async () => {
    const homeDir = await makeTempDir("myai-home-");
    const repoPath = await createRepo(homeDir);
    const sourceDir = await makeTempDir("myai-source-");

    await writeFile(path.join(sourceDir, "CLAUDE.md"), "# Team review rules\n");
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
              },
              broken: "not-an-object",
              unsupported: {
                type: "stdio",
              },
            },
          },
        },
      }),
    );

    const result = await importClaudeCodeProfile({
      repoPath,
      slug: "code-review",
      scope: "team",
      sourceDir,
      homeDir,
    });

    expect(result.importedAssets).toContain("mcps/github.yaml");
    expect(result.warnings).toContain("Skipped MCP server 'broken' because its Claude config entry is not an object.");
    expect(result.warnings).toContain(
      "Skipped MCP server 'unsupported' because its stdio transport is missing command.",
    );
  });

  it("requires explicit supported transport fields for Claude MCP imports", async () => {
    const homeDir = await makeTempDir("myai-home-");
    const repoPath = await createRepo(homeDir);
    const sourceDir = await makeTempDir("myai-source-");

    await writeFile(path.join(sourceDir, "CLAUDE.md"), "# Team review rules\n");
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
              },
              unknownTransport: {
                type: "websocket",
                command: "npx",
              },
              missingCommand: {
                type: "stdio",
              },
              missingUrl: {
                type: "http",
              },
              docs: {
                type: "http",
                url: "https://example.com/mcp",
              },
            },
          },
        },
      }),
    );

    const result = await importClaudeCodeProfile({
      repoPath,
      slug: "code-review",
      scope: "team",
      sourceDir,
      homeDir,
    });

    expect(result.importedAssets).toContain("mcps/github.yaml");
    expect(result.importedAssets).toContain("mcps/docs.yaml");
    expect(result.warnings).toContain(
      "Skipped MCP server 'unknownTransport' because its transport 'websocket' is not supported in v0.1.",
    );
    expect(result.warnings).toContain(
      "Skipped MCP server 'missingCommand' because its stdio transport is missing command.",
    );
    expect(result.warnings).toContain("Skipped MCP server 'missingUrl' because its http transport is missing url.");
  });

  it("fails with a clear error when ~/.claude.json is malformed", async () => {
    const homeDir = await makeTempDir("myai-home-");
    const repoPath = await createRepo(homeDir);
    const sourceDir = await makeTempDir("myai-source-");

    await writeFile(path.join(sourceDir, "CLAUDE.md"), "# Team review rules\n");
    await writeFile(path.join(homeDir, ".claude.json"), "{not-valid-json");

    await expect(
      importClaudeCodeProfile({
        repoPath,
        slug: "code-review",
        scope: "team",
        sourceDir,
        homeDir,
      }),
    ).rejects.toThrow("Failed to parse ~/.claude.json");
  });
});
