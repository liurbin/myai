import { realpath } from "node:fs/promises";
import path from "node:path";

import type { McpAsset, Profile, ProfileScope } from "../types.js";
import { writeMarkdownAsset, writeMcpAsset } from "./assets.js";
import { slugToTitle, slugify } from "./format.js";
import { pathExists, readTextFile } from "./fs.js";
import { appendEventLog } from "./logging.js";
import { saveProfile } from "./profile-store.js";

interface ClaudeProjectEntry {
  mcpServers?: unknown;
}

interface ClaudeConfig {
  projects?: unknown;
}

export interface ClaudeImportResult {
  profile: Profile;
  warnings: string[];
  importedAssets: string[];
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).map(([key, item]) => [key, String(item)]);
  return Object.fromEntries(entries);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function withPrivatePrefix(value: string): string {
  return value.startsWith("/private/") ? value : path.join("/private", value);
}

function withoutPrivatePrefix(value: string): string {
  return value.startsWith("/private/") ? value.slice("/private".length) : value;
}

async function candidateProjectKeys(sourceDir: string): Promise<string[]> {
  const candidates = new Set<string>();
  const resolved = path.resolve(sourceDir);

  candidates.add(sourceDir);
  candidates.add(resolved);
  candidates.add(withPrivatePrefix(resolved));
  candidates.add(withoutPrivatePrefix(resolved));

  try {
    const real = await realpath(sourceDir);
    candidates.add(real);
    candidates.add(withPrivatePrefix(real));
    candidates.add(withoutPrivatePrefix(real));
  } catch {
    // If the source path does not exist yet, use the path-based candidates above.
  }

  return [...candidates];
}

function normalizeMcpAsset(name: string, rawServer: unknown, warnings: string[]): McpAsset | null {
  if (!isPlainRecord(rawServer)) {
    warnings.push(`Skipped MCP server '${name}' because its Claude config entry is not an object.`);
    return null;
  }

  const transport = typeof rawServer.type === "string" ? rawServer.type : undefined;
  const command = typeof rawServer.command === "string" ? rawServer.command : undefined;
  const args = Array.isArray(rawServer.args) ? rawServer.args.map((value) => String(value)) : undefined;
  const env = asStringRecord(rawServer.env);
  const url = typeof rawServer.url === "string" ? rawServer.url : undefined;
  const headers = asStringRecord(rawServer.headers);
  const safeName = slugify(name);

  if (transport === "stdio") {
    if (!command) {
      warnings.push(`Skipped MCP server '${name}' because its stdio transport is missing command.`);
      return null;
    }

    return {
      version: 1,
      kind: "mcp",
      name: safeName,
      transport: "stdio",
      command,
      args,
      env,
      headers,
    };
  }

  if (transport === "http" || transport === "sse" || transport === "streamable-http") {
    if (!url) {
      warnings.push(`Skipped MCP server '${name}' because its ${transport} transport is missing url.`);
      return null;
    }

    return {
      version: 1,
      kind: "mcp",
      name: safeName,
      transport:
        transport === "sse" || transport === "streamable-http" ? transport : "http",
      url,
      env,
      headers,
    };
  }

  if (!transport) {
    warnings.push(`Skipped MCP server '${name}' because its transport is missing or unsupported in v0.1.`);
    return null;
  }

  warnings.push(`Skipped MCP server '${name}' because its transport '${transport}' is not supported in v0.1.`);
  return null;
}

async function readClaudeConfig(
  homeDir: string,
): Promise<ClaudeConfig | null> {
  const configPath = path.join(homeDir, ".claude.json");
  if (!(await pathExists(configPath))) {
    return null;
  }

  try {
    const parsed = JSON.parse(await readTextFile(configPath)) as ClaudeConfig;
    if (!isPlainRecord(parsed.projects)) {
      return null;
    }

    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ~/.claude.json: ${message}`);
  }
}

async function findClaudeProjectEntry(
  homeDir: string,
  sourceDir: string,
): Promise<ClaudeProjectEntry | null> {
  const config = await readClaudeConfig(homeDir);
  if (!config?.projects) {
    return null;
  }

  const projects = config.projects as Record<string, ClaudeProjectEntry>;
  for (const candidate of await candidateProjectKeys(sourceDir)) {
    const direct = projects[candidate];
    if (direct) {
      return direct;
    }
  }

  return null;
}

export async function importClaudeCodeProfile(options: {
  repoPath: string;
  slug: string;
  scope: ProfileScope;
  sourceDir: string;
  homeDir: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ClaudeImportResult> {
  const startedAt = Date.now();
  try {
    const warnings: string[] = [];
    const importedAssets: string[] = [];
    const assets = {
      prompts: [] as string[],
      preferences: [] as string[],
      mcps: [] as string[],
      skills: [] as string[],
    };

    const claudeMdPath = path.join(options.sourceDir, "CLAUDE.md");
    if (await pathExists(claudeMdPath)) {
      const contents = await readTextFile(claudeMdPath);
      const relativePath = await writeMarkdownAsset(
        options.repoPath,
        "preferences",
        `${options.slug}-claude`,
        contents,
      );
      assets.preferences.push(relativePath);
      importedAssets.push(relativePath);
    }

    const localSettingsPath = path.join(options.sourceDir, ".claude", "settings.local.json");
    if (await pathExists(localSettingsPath)) {
      warnings.push("Ignored .claude/settings.local.json because v0.1 does not map local Claude permissions.");
    }

    const projectEntry = await findClaudeProjectEntry(options.homeDir, options.sourceDir);
    if (projectEntry?.mcpServers && isPlainRecord(projectEntry.mcpServers)) {
      for (const [serverName, rawServer] of Object.entries(projectEntry.mcpServers)) {
        const normalized = normalizeMcpAsset(serverName, rawServer, warnings);
        if (!normalized) {
          continue;
        }

        const relativePath = await writeMcpAsset(options.repoPath, serverName, normalized);
        assets.mcps.push(relativePath);
        importedAssets.push(relativePath);
      }
    } else {
      warnings.push(
        "No Claude project MCP servers were found in ~/.claude.json for the selected source directory.",
      );
    }

    if (assets.preferences.length === 0 && assets.mcps.length === 0 && assets.prompts.length === 0) {
      throw new Error(
        "No supported Claude Code inputs found. v0.1 imports `CLAUDE.md` and project mcpServers from ~/.claude.json.",
      );
    }

    const profile: Profile = {
      version: 1,
      kind: "profile",
      name: slugToTitle(options.slug),
      slug: options.slug,
      scope: options.scope,
      description: `Imported from Claude Code at ${options.sourceDir}`,
      tags: ["claude-code", "imported"],
      source: {
        tool: "claude-code",
        imported_at: new Date().toISOString(),
      },
      assets,
      apply: {
        mode: "merge",
        confirm: true,
      },
      sync: {
        source: "claude-code",
        targets: ["codex"],
      },
    };

    await saveProfile(options.repoPath, profile);
    await appendEventLog(options.repoPath, {
      timestamp: new Date().toISOString(),
      event: "profile.import",
      profile: profile.slug,
      scope: profile.scope,
      source_tool: "claude-code",
      status: warnings.length > 0 ? "partial_success" : "success",
      duration_ms: Math.max(0, Date.now() - startedAt),
    }, { env: options.env });

    return { profile, warnings, importedAssets };
  } catch (error) {
    await appendEventLog(options.repoPath, {
      timestamp: new Date().toISOString(),
      event: "profile.import",
      profile: options.slug,
      scope: options.scope,
      source_tool: "claude-code",
      status: "failure",
      message: error instanceof Error ? error.message : String(error),
      duration_ms: Math.max(0, Date.now() - startedAt),
    }, { env: options.env });
    throw error;
  }
}
