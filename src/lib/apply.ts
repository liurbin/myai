import { cp, readdir, rm } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import path from "node:path";

import type { CommandRuntime, Profile, ProfileScope, SyncStatus } from "../types.js";
import { timestampForFile } from "./format.js";
import { ensureDir, pathExists, readTextFile, writeTextFile } from "./fs.js";
import { appendEventLog } from "./logging.js";
import { loadProfile } from "./profile-store.js";
import { writeYamlFile } from "./yaml.js";

interface ProfileAssetPreview {
  path: string;
  contents: string | null;
}

interface ApplyPlan {
  profile: Profile;
  targetDir: string;
  materializedRoot: string;
  backupPath: string | null;
  previewPath: string;
  appliedPath: string;
  previewDocument: string;
  appliedDocument: string;
  missingAssets: string[];
  warnings: string[];
}

interface RollbackPlan {
  profile: Profile;
  targetDir: string;
  materializedRoot: string;
  selectedBackupPath: string;
  currentBackupPath: string | null;
}

function getScopeAssets(profile: Profile): Array<{ heading: string; paths: string[] }> {
  return [
    { heading: "Prompts", paths: profile.assets.prompts },
    { heading: "Preferences", paths: profile.assets.preferences },
    { heading: "MCP Assets", paths: profile.assets.mcps },
    { heading: "Skills", paths: profile.assets.skills },
  ];
}

function formatList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

function getMaterializedRoot(targetDir: string, profile: Profile): string {
  return path.join(targetDir, ".myai-applied", profile.scope, profile.slug);
}

function getBackupsDir(targetDir: string): string {
  return path.join(targetDir, ".myai-applied", "backups");
}

function getBackupPrefix(profile: Profile): string {
  return `${profile.scope}-${profile.slug}-`;
}

function buildDocument(
  title: string,
  profile: Profile,
  targetDir: string,
  materializedRoot: string,
  backupPath: string | null,
  previewBySection: Array<{ heading: string; assets: ProfileAssetPreview[] }>,
  warnings: string[],
  missingAssets: string[],
  appendices: string[] = [],
): string {
  const lines: string[] = [
    `# ${title}`,
    "",
    `- slug: ${profile.slug}`,
    `- scope: ${profile.scope}`,
    `- mode: ${profile.apply.mode}`,
    `- confirm_required: ${profile.apply.confirm ? "true" : "false"}`,
    `- target_dir: ${targetDir}`,
    `- materialized_root: ${materializedRoot}`,
    `- backup_path: ${backupPath ?? "(none)"}`,
    "",
  ];

  for (const section of previewBySection) {
    lines.push(`## ${section.heading}`);
    if (section.assets.length === 0) {
      lines.push("- None");
      lines.push("");
      continue;
    }

    for (const asset of section.assets) {
      lines.push(`### ${asset.path}`);
      lines.push(asset.contents ?? "_Missing asset reference_");
      lines.push("");
    }
  }

  for (const appendix of appendices) {
    if (!appendix.trim()) {
      continue;
    }

    lines.push(appendix.trimEnd());
    lines.push("");
  }

  lines.push("## Warnings");
  lines.push(formatList(warnings));
  lines.push("");

  lines.push("## Missing Assets");
  lines.push(formatList(missingAssets));
  lines.push("");

  return `${lines.join("\n")}\n`;
}

async function readProfileAssets(
  repoPath: string,
  profile: Profile,
): Promise<{ previewBySection: Array<{ heading: string; assets: ProfileAssetPreview[] }>; missingAssets: string[] }> {
  const missingAssets: string[] = [];
  const previewBySection: Array<{ heading: string; assets: ProfileAssetPreview[] }> = [];

  for (const { heading, paths } of getScopeAssets(profile)) {
    const assets: ProfileAssetPreview[] = [];

    for (const assetPath of paths) {
      const fullPath = path.join(repoPath, assetPath);
      if (await pathExists(fullPath)) {
        assets.push({ path: assetPath, contents: await readTextFile(fullPath) });
      } else {
        assets.push({ path: assetPath, contents: null });
        missingAssets.push(assetPath);
      }
    }

    previewBySection.push({ heading, assets });
  }

  return { previewBySection, missingAssets };
}

async function confirmOperation(options: {
  runtime: CommandRuntime;
  prompt: string;
  nonInteractiveMessage: string;
  cancelledMessage: string;
}): Promise<void> {
  const { runtime, prompt, nonInteractiveMessage, cancelledMessage } = options;
  const input = runtime.stdin as NodeJS.ReadStream | undefined;
  const output = runtime.stdout as NodeJS.WriteStream | undefined;

  if (!input || !output || !input.isTTY) {
    throw new Error(nonInteractiveMessage);
  }

  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      throw new Error(cancelledMessage);
    }
  } finally {
    rl.close();
  }
}

async function confirmApply(runtime: CommandRuntime, profile: Profile): Promise<void> {
  await confirmOperation({
    runtime,
    prompt: `Apply profile '${profile.slug}'? [y/N] `,
    nonInteractiveMessage: `Applying profile '${profile.slug}' requires confirmation. Re-run with --yes in non-interactive mode.`,
    cancelledMessage: `Application of profile '${profile.slug}' was cancelled.`,
  });
}

async function confirmRollback(runtime: CommandRuntime, profile: Profile): Promise<void> {
  await confirmOperation({
    runtime,
    prompt: `Rollback profile '${profile.slug}' to the latest backup? [y/N] `,
    nonInteractiveMessage: `Rolling back profile '${profile.slug}' requires confirmation. Re-run with --yes in non-interactive mode.`,
    cancelledMessage: `Rollback of profile '${profile.slug}' was cancelled.`,
  });
}

async function writeApplyArtifacts(plan: ApplyPlan): Promise<void> {
  await ensureDir(path.dirname(plan.previewPath));
  await writeTextFile(plan.previewPath, plan.previewDocument);
}

function buildWarnings(profile: Profile): string[] {
  void profile;
  return [];
}

async function buildApplyPlan(options: {
  repoPath: string;
  profile: Profile;
  targetDir: string;
  previewAppendices?: string[];
  appliedAppendices?: string[];
}): Promise<ApplyPlan> {
  const { previewBySection, missingAssets } = await readProfileAssets(options.repoPath, options.profile);
  const warnings = buildWarnings(options.profile);
  const timestamp = timestampForFile();
  const materializedRoot = getMaterializedRoot(options.targetDir, options.profile);
  const backupPath = (await pathExists(materializedRoot))
    ? path.join(getBackupsDir(options.targetDir), `${getBackupPrefix(options.profile)}${timestamp}`)
    : null;
  const previewPath = path.join(options.repoPath, "logs", `preview-${options.profile.slug}-${timestamp}.md`);
  const appliedPath = path.join(options.repoPath, "logs", `applied-${options.profile.slug}-${timestamp}.md`);

  const previewDocument = buildDocument(
    "MyAI Profile Apply Preview",
    options.profile,
    options.targetDir,
    materializedRoot,
    backupPath,
    previewBySection,
    warnings,
    missingAssets,
    options.previewAppendices,
  );
  const appliedDocument = buildDocument(
    "MyAI Profile Applied Bundle",
    options.profile,
    options.targetDir,
    materializedRoot,
    backupPath,
    previewBySection,
    warnings,
    missingAssets,
    options.appliedAppendices,
  );

  return {
    profile: options.profile,
    targetDir: options.targetDir,
    materializedRoot,
    backupPath,
    previewPath,
    appliedPath,
    previewDocument,
    appliedDocument,
    missingAssets,
    warnings,
  };
}

async function findLatestBackup(targetDir: string, profile: Profile): Promise<string | null> {
  const backupsDir = getBackupsDir(targetDir);
  if (!(await pathExists(backupsDir))) {
    return null;
  }

  const entries = await readdir(backupsDir, { withFileTypes: true });
  const prefix = getBackupPrefix(profile);
  const matches = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => path.join(backupsDir, entry.name))
    .sort((left, right) => right.localeCompare(left));

  return matches[0] ?? null;
}

async function buildRollbackPlan(options: {
  profile: Profile;
  targetDir: string;
}): Promise<RollbackPlan> {
  const materializedRoot = getMaterializedRoot(options.targetDir, options.profile);
  const selectedBackupPath = await findLatestBackup(options.targetDir, options.profile);

  if (!selectedBackupPath) {
    throw new Error(
      `No backup found for profile '${options.profile.slug}' in ${getBackupsDir(options.targetDir)}.`,
    );
  }

  const currentBackupPath = (await pathExists(materializedRoot))
    ? path.join(getBackupsDir(options.targetDir), `${getBackupPrefix(options.profile)}${timestampForFile()}`)
    : null;

  return {
    profile: options.profile,
    targetDir: options.targetDir,
    materializedRoot,
    selectedBackupPath,
    currentBackupPath,
  };
}

async function recordProfileEvent(
  repoPath: string,
  profile: Profile,
  event: "profile.apply" | "bootstrap" | "profile.rollback",
  status: SyncStatus,
  message?: string,
  targetTool?: "codex",
  durationMs?: number,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  await appendEventLog(repoPath, {
    timestamp: new Date().toISOString(),
    event,
    profile: profile.slug,
    scope: profile.scope,
    source_tool: profile.source?.tool,
    target_tool: targetTool,
    status,
    message,
    duration_ms: durationMs,
  }, { env });
}

async function materializeProfile(repoPath: string, plan: ApplyPlan): Promise<void> {
  if (plan.backupPath) {
    await ensureDir(path.dirname(plan.backupPath));
    await cp(plan.materializedRoot, plan.backupPath, { recursive: true });
    await rm(plan.materializedRoot, { recursive: true, force: true });
  }

  await ensureDir(plan.materializedRoot);

  for (const { heading: _heading, assets } of await readProfileAssets(repoPath, plan.profile).then(
    (value) => value.previewBySection,
  )) {
    for (const asset of assets) {
      if (asset.contents === null) {
        continue;
      }

      const destinationPath = path.join(plan.materializedRoot, asset.path);
      await writeTextFile(destinationPath, asset.contents);
    }
  }

  await writeYamlFile(path.join(plan.materializedRoot, "profile.yaml"), plan.profile);
}

async function restoreBackup(plan: RollbackPlan): Promise<void> {
  if (plan.currentBackupPath) {
    await ensureDir(path.dirname(plan.currentBackupPath));
    await cp(plan.materializedRoot, plan.currentBackupPath, { recursive: true });
    await rm(plan.materializedRoot, { recursive: true, force: true });
  }

  await ensureDir(path.dirname(plan.materializedRoot));
  await cp(plan.selectedBackupPath, plan.materializedRoot, { recursive: true });
}

export async function applyProfile(options: {
  repoPath: string;
  slug: string;
  scope?: ProfileScope;
  profile?: Profile;
  targetDir: string;
  runtime: CommandRuntime;
  yes: boolean;
  eventName: "profile.apply" | "bootstrap";
  recordEvent?: boolean;
  previewAppendices?: string[];
  appliedAppendices?: string[];
}): Promise<{
  profile: Profile;
  targetDir: string;
  targetPath: string;
  backupPath: string | null;
  previewPath: string;
  bundlePath: string;
  warnings: string[];
}> {
  const startedAt = Date.now();
  const profile = options.profile ?? await loadProfile(options.repoPath, options.slug, options.scope);
  const plan = await buildApplyPlan({
    repoPath: options.repoPath,
    profile,
    targetDir: options.targetDir,
    previewAppendices: options.previewAppendices,
    appliedAppendices: options.appliedAppendices,
  });
  await writeApplyArtifacts(plan);

  if (plan.missingAssets.length > 0) {
    if (options.recordEvent !== false) {
      await recordProfileEvent(
        options.repoPath,
        profile,
        options.eventName,
        "failure",
        `Missing assets: ${plan.missingAssets.join(", ")}`,
        undefined,
        Math.max(0, Date.now() - startedAt),
        options.runtime.env,
      );
    }
    throw new Error(
      `Profile '${profile.slug}' is incomplete. Missing assets: ${plan.missingAssets.join(", ")}. See preview: ${plan.previewPath}`,
    );
  }

  if (!options.yes) {
    try {
      await confirmApply(options.runtime, profile);
    } catch (error) {
      if (options.recordEvent !== false) {
        await recordProfileEvent(
          options.repoPath,
          profile,
          options.eventName,
          "failure",
          error instanceof Error ? error.message : String(error),
          undefined,
          Math.max(0, Date.now() - startedAt),
          options.runtime.env,
        );
      }
      throw error;
    }
  }

  await materializeProfile(options.repoPath, plan);
  await writeTextFile(plan.appliedPath, plan.appliedDocument);
  if (options.recordEvent !== false) {
    await recordProfileEvent(
      options.repoPath,
      profile,
      options.eventName,
      "success",
      `${options.eventName === "bootstrap" ? "bootstrap applied" : "profile applied"} to ${plan.materializedRoot}`,
      undefined,
      Math.max(0, Date.now() - startedAt),
      options.runtime.env,
    );
  }

  return {
    profile,
    targetDir: plan.targetDir,
    targetPath: plan.materializedRoot,
    backupPath: plan.backupPath,
    previewPath: plan.previewPath,
    bundlePath: plan.appliedPath,
    warnings: plan.warnings,
  };
}

export async function rollbackProfile(options: {
  repoPath: string;
  slug: string;
  scope?: ProfileScope;
  targetDir: string;
  runtime: CommandRuntime;
  yes: boolean;
}): Promise<{
  profile: Profile;
  targetDir: string;
  targetPath: string;
  restoredFrom: string;
  backupPath: string | null;
}> {
  const startedAt = Date.now();
  const profile = await loadProfile(options.repoPath, options.slug, options.scope);
  try {
    const plan = await buildRollbackPlan({
      profile,
      targetDir: options.targetDir,
    });

    if (!options.yes) {
      await confirmRollback(options.runtime, profile);
    }

    await restoreBackup(plan);

    await recordProfileEvent(
      options.repoPath,
      profile,
      "profile.rollback",
      "success",
      `profile restored from ${plan.selectedBackupPath} to ${plan.materializedRoot}`,
      undefined,
      Math.max(0, Date.now() - startedAt),
      options.runtime.env,
    );

    return {
      profile,
      targetDir: plan.targetDir,
      targetPath: plan.materializedRoot,
      restoredFrom: plan.selectedBackupPath,
      backupPath: plan.currentBackupPath,
    };
  } catch (error) {
    await recordProfileEvent(
      options.repoPath,
      profile,
      "profile.rollback",
      "failure",
      error instanceof Error ? error.message : String(error),
      undefined,
      Math.max(0, Date.now() - startedAt),
      options.runtime.env,
    );
    throw error;
  }
}
