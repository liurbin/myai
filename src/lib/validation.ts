import path from "node:path";

import type { McpAsset, Profile, ProfileScope, SourceTool, TargetTool } from "../types.js";
import { pathExists } from "./fs.js";

type PlainRecord = Record<string, unknown>;

const SUPPORTED_PROFILE_SCOPES = new Set<ProfileScope>(["team", "personal"]);
const SUPPORTED_SOURCE_TOOLS = new Set<SourceTool>(["claude-code"]);
const SUPPORTED_TARGET_TOOLS = new Set<TargetTool>(["codex"]);
const SUPPORTED_MCP_TRANSPORTS = new Set<McpAsset["transport"]>([
  "stdio",
  "http",
  "sse",
  "streamable-http",
]);

function isPlainRecord(value: unknown): value is PlainRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function expectPlainRecord(value: unknown, label: string): PlainRecord {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

function expectLiteralNumber(value: unknown, expected: number, label: string): number {
  if (value !== expected) {
    throw new Error(`${label} must be ${expected}.`);
  }

  return expected;
}

function expectStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of strings.`);
  }

  const values = value.map((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error(`${label}[${index}] must be a non-empty string.`);
    }

    return item;
  });

  return values;
}

function expectOptionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectStringArray(value, label);
}

function expectStringRecord(value: unknown, label: string): Record<string, string> {
  const record = expectPlainRecord(value, label);
  const output: Record<string, string> = {};

  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== "string") {
      throw new Error(`${label}.${key} must be a string.`);
    }

    output[key] = item;
  }

  return output;
}

function expectProfileScope(value: unknown, label: string): ProfileScope {
  const scope = expectString(value, label);
  if (!SUPPORTED_PROFILE_SCOPES.has(scope as ProfileScope)) {
    throw new Error(`${label} must be 'team' or 'personal'.`);
  }

  return scope as ProfileScope;
}

function expectSourceTool(value: unknown, label: string): SourceTool {
  const tool = expectString(value, label);
  if (!SUPPORTED_SOURCE_TOOLS.has(tool as SourceTool)) {
    throw new Error(`${label} must be one of: ${[...SUPPORTED_SOURCE_TOOLS].join(", ")}.`);
  }

  return tool as SourceTool;
}

function expectTargetTools(value: unknown, label: string): TargetTool[] {
  const targets = expectStringArray(value, label);
  for (const target of targets) {
    if (!SUPPORTED_TARGET_TOOLS.has(target as TargetTool)) {
      throw new Error(`${label} includes unsupported target '${target}'.`);
    }
  }

  return targets as TargetTool[];
}

export function validateProfile(value: unknown, filePath?: string): Profile {
  const profile = expectPlainRecord(value, filePath ? `Profile '${filePath}'` : "Profile");
  const assets = expectPlainRecord(profile.assets, "profile.assets");
  const apply = expectPlainRecord(profile.apply, "profile.apply");

  const validated: Profile = {
    version: expectLiteralNumber(profile.version, 1, "profile.version") as 1,
    kind: expectString(profile.kind, "profile.kind") as "profile",
    name: expectString(profile.name, "profile.name"),
    slug: expectString(profile.slug, "profile.slug"),
    scope: expectProfileScope(profile.scope, "profile.scope"),
    assets: {
      prompts: expectStringArray(assets.prompts, "profile.assets.prompts"),
      preferences: expectStringArray(assets.preferences, "profile.assets.preferences"),
      mcps: expectStringArray(assets.mcps, "profile.assets.mcps"),
      skills: expectStringArray(assets.skills, "profile.assets.skills"),
    },
    apply: {
      mode: expectString(apply.mode, "profile.apply.mode") as "merge",
      confirm: expectBoolean(apply.confirm, "profile.apply.confirm"),
    },
  };

  if (validated.kind !== "profile") {
    throw new Error("profile.kind must be 'profile'.");
  }
  if (validated.apply.mode !== "merge") {
    throw new Error("profile.apply.mode must be 'merge' in v0.1.");
  }

  if (profile.description !== undefined) {
    validated.description = expectString(profile.description, "profile.description");
  }
  if (profile.tags !== undefined) {
    validated.tags = expectStringArray(profile.tags, "profile.tags");
  }
  if (profile.source !== undefined) {
    const source = expectPlainRecord(profile.source, "profile.source");
    validated.source = {
      tool: expectSourceTool(source.tool, "profile.source.tool"),
      imported_at: expectString(source.imported_at, "profile.source.imported_at"),
    };
  }
  if (profile.sync !== undefined) {
    const sync = expectPlainRecord(profile.sync, "profile.sync");
    validated.sync = {
      source: expectSourceTool(sync.source, "profile.sync.source"),
      targets: expectTargetTools(sync.targets, "profile.sync.targets"),
    };
  }

  if (filePath) {
    const expectedSlug = path.parse(filePath).name;
    if (expectedSlug !== validated.slug) {
      throw new Error(`Profile filename '${expectedSlug}' must match slug '${validated.slug}'.`);
    }
  }

  return validated;
}

export function validateMcpAsset(value: unknown, filePath?: string): McpAsset {
  const asset = expectPlainRecord(value, filePath ? `MCP '${filePath}'` : "MCP");
  const transport = expectString(asset.transport, "mcp.transport") as McpAsset["transport"];

  if (expectString(asset.kind, "mcp.kind") !== "mcp") {
    throw new Error("mcp.kind must be 'mcp'.");
  }
  if (!SUPPORTED_MCP_TRANSPORTS.has(transport)) {
    throw new Error(`mcp.transport '${transport}' is unsupported.`);
  }

  const validated: McpAsset = {
    version: expectLiteralNumber(asset.version, 1, "mcp.version") as 1,
    kind: "mcp",
    name: expectString(asset.name, "mcp.name"),
    transport,
  };

  const args = expectOptionalStringArray(asset.args, "mcp.args");
  if (args) {
    validated.args = args;
  }

  if (asset.env !== undefined) {
    validated.env = expectStringRecord(asset.env, "mcp.env");
  }
  if (asset.headers !== undefined) {
    validated.headers = expectStringRecord(asset.headers, "mcp.headers");
  }

  if (transport === "stdio") {
    validated.command = expectString(asset.command, "mcp.command");
  } else {
    validated.url = expectString(asset.url, "mcp.url");
  }

  return validated;
}

export async function validateProfileAssetReferences(repoPath: string, profile: Profile): Promise<void> {
  const missing: string[] = [];
  const references = [
    ...profile.assets.prompts,
    ...profile.assets.preferences,
    ...profile.assets.mcps,
    ...profile.assets.skills,
  ];

  for (const relativePath of references) {
    if (!(await pathExists(path.join(repoPath, relativePath)))) {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Profile '${profile.slug}' has missing asset references: ${missing.join(", ")}.`);
  }
}
