import path from "node:path";

import type { McpAsset, Profile, ProfileScope, SyncStatus, TargetTool } from "../types.js";
import { pathExists, readTextFile, writeTextFile } from "./fs.js";
import { getHomeDir } from "./repo.js";
import { appendEventLog } from "./logging.js";
import { loadProfile } from "./profile-store.js";
import { readYamlFile } from "./yaml.js";
import { validateMcpAsset, validateProfileAssetReferences } from "./validation.js";

export interface CodexSyncResult {
  profile: Profile;
  warnings: string[];
  syncedServers: string[];
  targetConfigPath: string;
  status: SyncStatus;
}

export interface CodexSyncPreview {
  profile: Profile;
  warnings: string[];
  syncedServers: string[];
  targetConfigPath: string;
  status: SyncStatus;
  previewDocument: string;
}

interface CodexSyncPlan extends CodexSyncResult {
  existingConfig: string;
  nextConfig: string;
  managedBlock: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function renderTomlString(value: string): string {
  return `"${escapeTomlString(value)}"`;
}

function renderTomlArray(values: string[]): string {
  return `[${values.map(renderTomlString).join(", ")}]`;
}

function renderTomlInlineTable(values: Record<string, string>): string {
  const entries = Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key} = ${renderTomlString(value)}`);
  return `{ ${entries.join(", ")} }`;
}

function formatList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

function removeManagedBlock(configText: string, slug: string): string {
  const start = `# >>> myai profile ${slug}`;
  const end = `# <<< myai profile ${slug}`;
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "g");
  return configText.replace(pattern, "").trimEnd();
}

function hasExistingServerSection(configText: string, serverName: string): boolean {
  const pattern = new RegExp(`^\\[mcp_servers\\.${escapeRegExp(serverName)}\\]$`, "m");
  return pattern.test(configText);
}

function renderManagedBlock(
  slug: string,
  assets: McpAsset[],
  warnings: string[],
  configWithoutManagedBlock: string,
): { block: string; syncedServers: string[] } {
  const sections: string[] = [];
  const syncedServers: string[] = [];

  for (const asset of assets) {
    if (hasExistingServerSection(configWithoutManagedBlock, asset.name)) {
      warnings.push(`Skipped MCP server '${asset.name}' because the target Codex config already defines it.`);
      continue;
    }

    if (asset.headers && Object.keys(asset.headers).length > 0) {
      warnings.push(`MCP headers for '${asset.name}' were not synced to codex.`);
    }

    const lines = [`[mcp_servers.${asset.name}]`];

    if (asset.transport === "stdio") {
      if (!asset.command) {
        warnings.push(`Skipped MCP server '${asset.name}' because command is missing.`);
        continue;
      }

      lines.push(`command = ${renderTomlString(asset.command)}`);
      if (asset.args && asset.args.length > 0) {
        lines.push(`args = ${renderTomlArray(asset.args)}`);
      }
      if (asset.env && Object.keys(asset.env).length > 0) {
        lines.push(`env = ${renderTomlInlineTable(asset.env)}`);
      }
    } else if (
      asset.transport === "http" ||
      asset.transport === "sse" ||
      asset.transport === "streamable-http"
    ) {
      if (!asset.url) {
        warnings.push(`Skipped MCP server '${asset.name}' because url is missing.`);
        continue;
      }

      lines.push(`url = ${renderTomlString(asset.url)}`);
      if (asset.env && Object.keys(asset.env).length > 0) {
        lines.push(`env = ${renderTomlInlineTable(asset.env)}`);
      }
    } else {
      warnings.push(`Skipped MCP server '${asset.name}' because transport '${asset.transport}' is unsupported.`);
      continue;
    }

    sections.push(lines.join("\n"));
    syncedServers.push(asset.name);
  }

  if (sections.length === 0) {
    return { block: "", syncedServers };
  }

  const start = `# >>> myai profile ${slug}`;
  const end = `# <<< myai profile ${slug}`;
  const block = `${start}\n${sections.join("\n\n")}\n${end}`;
  return { block, syncedServers };
}

function getSyncStatus(warnings: string[]): SyncStatus {
  return warnings.length > 0 ? "partial_success" : "success";
}

function assertCodexSyncSupport(profile: Profile): void {
  if (!profile.sync) {
    throw new Error(`Profile '${profile.slug}' does not declare sync support.`);
  }

  if (profile.sync.source !== "claude-code") {
    throw new Error(
      `Profile '${profile.slug}' cannot sync to codex because sync.source '${profile.sync.source}' is unsupported.`,
    );
  }

  if (!profile.sync.targets.includes("codex")) {
    throw new Error(`Profile '${profile.slug}' does not include codex in sync.targets.`);
  }
}

function buildSyncPreviewDocument(plan: CodexSyncPlan): string {
  const lines: string[] = [
    "## MyAI Codex Sync Preview",
    "",
    `- target_config_path: ${plan.targetConfigPath}`,
    `- sync_status: ${plan.status}`,
    `- synced_servers: ${plan.syncedServers.join(", ") || "(none)"}`,
    "",
    "### Managed Block",
  ];

  if (plan.managedBlock) {
    lines.push("```toml");
    lines.push(plan.managedBlock);
    lines.push("```");
  } else {
    lines.push("_No managed block changes_");
  }

  lines.push("");
  lines.push("### Warnings");
  lines.push(formatList(plan.warnings));
  lines.push("");

  return `${lines.join("\n")}\n`;
}

async function planProfileSyncToCodex(options: {
  repoPath: string;
  slug: string;
  scope?: ProfileScope;
  profile?: Profile;
  homeDir: string;
  targetConfigPath?: string;
}): Promise<CodexSyncPlan> {
  const profile = options.profile ?? await loadProfile(options.repoPath, options.slug, options.scope);
  assertCodexSyncSupport(profile);
  await validateProfileAssetReferences(options.repoPath, profile);

  const warnings: string[] = [];
  for (const skill of profile.assets.skills) {
    warnings.push(`Skill reference '${skill}' is stored in the profile but is not applied to codex.`);
  }

  const mcpAssets = await Promise.all(
    profile.assets.mcps.map(async (relativePath) =>
      validateMcpAsset(
        await readYamlFile<unknown>(path.join(options.repoPath, relativePath)),
        relativePath,
      ),
    ),
  );

  const targetConfigPath =
    options.targetConfigPath ?? path.join(options.homeDir, ".codex", "config.toml");

  const existingConfig = (await pathExists(targetConfigPath)) ? await readTextFile(targetConfigPath) : "";
  const configWithoutManagedBlock = removeManagedBlock(existingConfig, profile.slug);
  const { block, syncedServers } = renderManagedBlock(
    profile.slug,
    mcpAssets,
    warnings,
    configWithoutManagedBlock,
  );

  let nextConfig = configWithoutManagedBlock;
  if (block) {
    nextConfig = configWithoutManagedBlock
      ? `${configWithoutManagedBlock}\n\n${block}\n`
      : `${block}\n`;
  } else if (configWithoutManagedBlock) {
    nextConfig = `${configWithoutManagedBlock}\n`;
  }

  return {
    profile,
    warnings,
    syncedServers,
    targetConfigPath,
    status: getSyncStatus(warnings),
    existingConfig,
    nextConfig,
    managedBlock: block,
  };
}

export async function previewProfileSyncToCodex(options: {
  repoPath: string;
  slug: string;
  scope?: ProfileScope;
  profile?: Profile;
  homeDir: string;
  targetConfigPath?: string;
}): Promise<CodexSyncPreview> {
  const plan = await planProfileSyncToCodex(options);

  return {
    profile: plan.profile,
    warnings: plan.warnings,
    syncedServers: plan.syncedServers,
    targetConfigPath: plan.targetConfigPath,
    status: plan.status,
    previewDocument: buildSyncPreviewDocument(plan),
  };
}

export async function syncProfileToCodex(options: {
  repoPath: string;
  slug: string;
  scope?: ProfileScope;
  profile?: Profile;
  homeDir: string;
  targetConfigPath?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<CodexSyncResult> {
  const startedAt = Date.now();
  let profile: Profile | null = null;

  try {
    profile = options.profile ?? await loadProfile(options.repoPath, options.slug, options.scope);
    const plan = await planProfileSyncToCodex({
      ...options,
      profile,
    });

    if (plan.nextConfig !== plan.existingConfig) {
      if (plan.existingConfig) {
        await writeTextFile(`${plan.targetConfigPath}.bak`, plan.existingConfig);
      }
      await writeTextFile(plan.targetConfigPath, plan.nextConfig);
    }

    await appendEventLog(options.repoPath, {
      timestamp: new Date().toISOString(),
      event: "profile.sync",
      profile: profile.slug,
      scope: profile.scope,
      source_tool: "claude-code",
      target_tool: "codex" as TargetTool,
      status: plan.status,
      message: `synced ${plan.syncedServers.length} MCP server(s) to ${plan.targetConfigPath}`,
      duration_ms: Math.max(0, Date.now() - startedAt),
    }, { env: options.env });

    return {
      profile,
      warnings: plan.warnings,
      syncedServers: plan.syncedServers,
      targetConfigPath: plan.targetConfigPath,
      status: plan.status,
    };
  } catch (error) {
    if (profile) {
      await appendEventLog(options.repoPath, {
        timestamp: new Date().toISOString(),
        event: "profile.sync",
        profile: profile.slug,
        scope: profile.scope,
        source_tool: "claude-code",
        target_tool: "codex" as TargetTool,
        status: "failure",
        message: error instanceof Error ? error.message : String(error),
        duration_ms: Math.max(0, Date.now() - startedAt),
      }, { env: options.env });
    }

    throw error;
  }
}

export function resolveCodexConfigPath(
  env: NodeJS.ProcessEnv,
  explicitPath: string | undefined,
  cwd: string,
): string {
  if (explicitPath) {
    return path.isAbsolute(explicitPath) ? explicitPath : path.resolve(cwd, explicitPath);
  }

  return path.join(getHomeDir(env), ".codex", "config.toml");
}
