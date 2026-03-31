import type { CommandRuntime, Profile, ProfileScope } from "./types.js";
import { applyProfile, rollbackProfile } from "./lib/apply.js";
import { importClaudeCodeProfile } from "./lib/claude.js";
import { previewProfileSyncToCodex, resolveCodexConfigPath, syncProfileToCodex } from "./lib/codex.js";
import { slugify } from "./lib/format.js";
import { appendEventLog } from "./lib/logging.js";
import { formatReportSummary, summarizeEvents } from "./lib/reporting.js";
import { initRepository, getDefaultRepoPath, getHomeDir, resolveInputPath, resolveRepoPath } from "./lib/repo.js";
import { listProfiles, loadProfile, searchProfiles } from "./lib/profile-store.js";

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | boolean>;
}

const ROOT_USAGE = "Usage: myai <init|profile|bootstrap|report|help> [...args]";
const PROFILE_USAGE =
  "Usage: myai profile <import|list|show|search|apply|rollback|sync> [...args]";
const REPORT_USAGE = "Usage: myai report <summary|help> [...args]";

function createRuntime(runtime?: Partial<CommandRuntime>): CommandRuntime {
  return {
    cwd: runtime?.cwd ?? process.cwd(),
    env: runtime?.env ?? process.env,
    stdout: runtime?.stdout ?? process.stdout,
    stderr: runtime?.stderr ?? process.stderr,
    stdin: runtime?.stdin ?? process.stdin,
  };
}

function writeLine(writer: { write(chunk: string): void }, line = ""): void {
  writer.write(`${line}\n`);
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, true);
      continue;
    }

    flags.set(key, next);
    index += 1;
  }

  return { positional, flags };
}

function requireStringFlag(parsed: ParsedArgs, name: string): string {
  const value = parsed.flags.get(name);
  if (typeof value !== "string") {
    throw new Error(`Missing required flag --${name}.`);
  }
  return value;
}

function getStringFlag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function getBooleanFlag(parsed: ParsedArgs, name: string): boolean {
  return parsed.flags.get(name) === true;
}

function resolveTargetDir(parsed: ParsedArgs, runtime: CommandRuntime): string {
  const targetDir = getStringFlag(parsed, "target-dir");
  if (!targetDir) {
    return runtime.cwd;
  }

  return resolveInputPath(targetDir, runtime.cwd);
}

function getScopeFlag(parsed: ParsedArgs): ProfileScope | undefined {
  const scope = getStringFlag(parsed, "scope");
  if (!scope) {
    return undefined;
  }
  if (scope !== "team" && scope !== "personal") {
    throw new Error("Scope must be either 'team' or 'personal'.");
  }
  return scope;
}

function printWarnings(runtime: CommandRuntime, warnings: string[]): void {
  for (const warning of warnings) {
    writeLine(runtime.stderr, `Warning: ${warning}`);
  }
}

async function getCodexSyncPreview(options: {
  repoPath: string;
  profile: Profile;
  env: NodeJS.ProcessEnv;
  targetConfigPath: string;
}): Promise<Awaited<ReturnType<typeof previewProfileSyncToCodex>> | null> {
  const { repoPath, profile, env, targetConfigPath } = options;
  if (!profile.sync?.targets.includes("codex")) {
    return null;
  }

  return previewProfileSyncToCodex({
    repoPath,
    slug: profile.slug,
    scope: profile.scope,
    profile,
    homeDir: getHomeDir(env),
    targetConfigPath,
  });
}

async function appendProfileOutcomeEvent(options: {
  repoPath: string;
  event: "profile.apply" | "bootstrap";
  slug: string;
  scope: ProfileScope;
  profile?: Profile;
  status: "success" | "partial_success" | "failure";
  message: string;
  targetTool?: "codex";
  durationMs?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const { repoPath, event, slug, scope, profile, status, message, targetTool, durationMs, env } = options;

  await appendEventLog(repoPath, {
    timestamp: new Date().toISOString(),
    event,
    profile: profile?.slug ?? slug,
    scope: profile?.scope ?? scope,
    source_tool: profile?.source?.tool,
    target_tool: targetTool,
    status,
    message,
    duration_ms: durationMs,
  }, { env });
}

function printHelp(runtime: CommandRuntime): void {
  writeLine(runtime.stdout, ROOT_USAGE);
  writeLine(runtime.stdout);
  writeLine(runtime.stdout, "Commands:");
  writeLine(runtime.stdout, "  myai init [repo-path]");
  writeLine(runtime.stdout, "  myai profile import <slug> --from claude-code [--scope team|personal]");
  writeLine(runtime.stdout, "  myai profile list [--scope team|personal]");
  writeLine(runtime.stdout, "  myai profile show <slug> [--scope team|personal]");
  writeLine(runtime.stdout, "  myai profile search <query>");
  writeLine(
    runtime.stdout,
    "  myai profile apply <slug> [--scope team|personal] [--target-dir path] [--target-config path] [--yes]",
  );
  writeLine(runtime.stdout, "  myai profile rollback <slug> [--scope team|personal] [--target-dir path] [--yes]");
  writeLine(runtime.stdout, "  myai profile sync <slug> --to codex [--target-config path]");
  writeLine(runtime.stdout, "  myai bootstrap <slug> [--scope team|personal] [--target-dir path] [--target-config path] [--yes]");
  writeLine(runtime.stdout, "  myai report summary [--since 14d|all|YYYY-MM-DD] [--format text|json]");
}

async function handleInit(parsed: ParsedArgs, runtime: CommandRuntime): Promise<number> {
  const target = parsed.positional[0]
    ? resolveInputPath(parsed.positional[0], runtime.cwd)
    : getDefaultRepoPath(runtime.env);
  const result = await initRepository(target);

  writeLine(runtime.stdout, `Initialized MyAI repository at ${result.repoPath}`);
  if (result.created.length > 0) {
    writeLine(runtime.stdout, `Created: ${result.created.join(", ")}`);
  }
  return 0;
}

async function handleProfileImport(parsed: ParsedArgs, runtime: CommandRuntime): Promise<number> {
  const slug = parsed.positional[0];
  if (!slug) {
    throw new Error("Usage: myai profile import <slug> --from claude-code");
  }

  const sourceTool = requireStringFlag(parsed, "from");
  if (sourceTool !== "claude-code") {
    throw new Error("v0.1 only supports `--from claude-code`.");
  }

  const repoPath = await resolveRepoPath(runtime.cwd, runtime.env, getStringFlag(parsed, "repo"));
  const sourceDir = resolveInputPath(getStringFlag(parsed, "source-dir") ?? runtime.cwd, runtime.cwd);
  const scope = getScopeFlag(parsed) ?? "team";

  const result = await importClaudeCodeProfile({
    repoPath,
    slug: slugify(slug),
    scope,
    sourceDir,
    homeDir: getHomeDir(runtime.env),
    env: runtime.env,
  });

  writeLine(runtime.stdout, `Imported profile '${result.profile.slug}' into ${repoPath}`);
  if (result.importedAssets.length > 0) {
    writeLine(runtime.stdout, `Assets: ${result.importedAssets.join(", ")}`);
  }
  printWarnings(runtime, result.warnings);
  return 0;
}

async function handleProfileList(parsed: ParsedArgs, runtime: CommandRuntime): Promise<number> {
  const repoPath = await resolveRepoPath(runtime.cwd, runtime.env, getStringFlag(parsed, "repo"));
  const profiles = await listProfiles(repoPath, getScopeFlag(parsed));

  if (profiles.length === 0) {
    writeLine(runtime.stdout, "No profiles found.");
    return 0;
  }

  for (const profile of profiles) {
    writeLine(
      runtime.stdout,
      `${profile.slug}\t${profile.scope}\t${profile.name}${profile.tags?.length ? `\t${profile.tags.join(",")}` : ""}`,
    );
  }

  return 0;
}

async function handleProfileShow(parsed: ParsedArgs, runtime: CommandRuntime): Promise<number> {
  const slug = parsed.positional[0];
  if (!slug) {
    throw new Error("Usage: myai profile show <slug>");
  }

  const repoPath = await resolveRepoPath(runtime.cwd, runtime.env, getStringFlag(parsed, "repo"));
  const profile = await loadProfile(repoPath, slugify(slug), getScopeFlag(parsed));

  writeLine(runtime.stdout, `name: ${profile.name}`);
  writeLine(runtime.stdout, `slug: ${profile.slug}`);
  writeLine(runtime.stdout, `scope: ${profile.scope}`);
  writeLine(runtime.stdout, `prompts: ${profile.assets.prompts.join(", ") || "(none)"}`);
  writeLine(runtime.stdout, `preferences: ${profile.assets.preferences.join(", ") || "(none)"}`);
  writeLine(runtime.stdout, `mcps: ${profile.assets.mcps.join(", ") || "(none)"}`);
  writeLine(runtime.stdout, `skills: ${profile.assets.skills.join(", ") || "(none)"}`);
  writeLine(runtime.stdout, `sync.source: ${profile.sync?.source ?? "(none)"}`);
  writeLine(runtime.stdout, `sync.targets: ${profile.sync?.targets?.join(", ") || "(none)"}`);
  return 0;
}

async function handleProfileSearch(parsed: ParsedArgs, runtime: CommandRuntime): Promise<number> {
  const query = parsed.positional[0];
  if (!query) {
    throw new Error("Usage: myai profile search <query>");
  }

  const repoPath = await resolveRepoPath(runtime.cwd, runtime.env, getStringFlag(parsed, "repo"));
  const profiles = await searchProfiles(repoPath, query);

  await appendEventLog(repoPath, {
    timestamp: new Date().toISOString(),
    event: "profile.search",
    profile: "(search)",
    scope: getScopeFlag(parsed) ?? "team",
    status: "success",
    query,
    result_count: profiles.length,
    matched_profiles: profiles.map((profile) => profile.slug),
  }, { env: runtime.env });

  if (profiles.length === 0) {
    writeLine(runtime.stdout, `No profiles matched '${query}'.`);
    return 0;
  }

  for (const profile of profiles) {
    writeLine(runtime.stdout, `${profile.slug}\t${profile.scope}\t${profile.name}`);
  }

  return 0;
}

async function handleProfileApply(parsed: ParsedArgs, runtime: CommandRuntime): Promise<number> {
  const slug = parsed.positional[0];
  if (!slug) {
    throw new Error(
      "Usage: myai profile apply <slug> [--scope team|personal] [--target-dir path] [--target-config path] [--yes]",
    );
  }

  const repoPath = await resolveRepoPath(runtime.cwd, runtime.env, getStringFlag(parsed, "repo"));
  const resolvedSlug = slugify(slug);
  const requestedScope = getScopeFlag(parsed);
  const resolvedScope = requestedScope ?? "team";
  const targetConfigPath = resolveCodexConfigPath(runtime.env, getStringFlag(parsed, "target-config"), runtime.cwd);
  const startedAt = Date.now();
  let profile: Profile | undefined;

  try {
    profile = await loadProfile(repoPath, resolvedSlug, requestedScope);
    const syncPreview = await getCodexSyncPreview({
      repoPath,
      profile,
      env: runtime.env,
      targetConfigPath,
    });

    const result = await applyProfile({
      repoPath,
      slug: profile.slug,
      scope: profile.scope,
      profile,
      targetDir: resolveTargetDir(parsed, runtime),
      runtime,
      yes: getBooleanFlag(parsed, "yes"),
      eventName: "profile.apply",
      recordEvent: false,
      previewAppendices: syncPreview ? [syncPreview.previewDocument] : undefined,
      appliedAppendices: syncPreview ? [syncPreview.previewDocument] : undefined,
    });

    const syncResult = syncPreview
      ? await syncProfileToCodex({
          repoPath,
          slug: result.profile.slug,
          scope: result.profile.scope,
          profile: result.profile,
          homeDir: getHomeDir(runtime.env),
          targetConfigPath,
          env: runtime.env,
        })
      : null;

    await appendProfileOutcomeEvent({
      repoPath,
      event: "profile.apply",
      slug: resolvedSlug,
      scope: resolvedScope,
      profile: result.profile,
      status: syncResult?.status ?? "success",
      targetTool: syncResult ? "codex" : undefined,
      durationMs: elapsedMs(startedAt),
      env: runtime.env,
      message: syncResult
        ? `profile applied to ${result.targetPath} and codex synced to ${syncResult.targetConfigPath}`
        : `profile applied to ${result.targetPath}`,
    });

    writeLine(runtime.stdout, `Applied profile '${result.profile.slug}'.`);
    writeLine(runtime.stdout, `Applied to: ${result.targetPath}`);
    if (result.backupPath) {
      writeLine(runtime.stdout, `Backup: ${result.backupPath}`);
    }
    writeLine(runtime.stdout, `Preview: ${result.previewPath}`);
    writeLine(runtime.stdout, `Rendered bundle: ${result.bundlePath}`);
    printWarnings(runtime, result.warnings);
    if (syncResult) {
      writeLine(runtime.stdout, `Codex config: ${syncResult.targetConfigPath}`);
      writeLine(runtime.stdout, `Synced MCP servers: ${syncResult.syncedServers.join(", ") || "(none)"}`);
      printWarnings(runtime, syncResult.warnings);
    }
    return 0;
  } catch (error) {
    await appendProfileOutcomeEvent({
      repoPath,
      event: "profile.apply",
      slug: resolvedSlug,
      scope: resolvedScope,
      profile,
      status: "failure",
      targetTool: profile?.sync?.targets.includes("codex") ? "codex" : undefined,
      durationMs: elapsedMs(startedAt),
      env: runtime.env,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function handleProfileRollback(parsed: ParsedArgs, runtime: CommandRuntime): Promise<number> {
  const slug = parsed.positional[0];
  if (!slug) {
    throw new Error("Usage: myai profile rollback <slug> [--scope team|personal] [--target-dir path] [--yes]");
  }

  const repoPath = await resolveRepoPath(runtime.cwd, runtime.env, getStringFlag(parsed, "repo"));
  const result = await rollbackProfile({
    repoPath,
    slug: slugify(slug),
    scope: getScopeFlag(parsed),
    targetDir: resolveTargetDir(parsed, runtime),
    runtime,
    yes: getBooleanFlag(parsed, "yes"),
  });

  writeLine(runtime.stdout, `Rolled back profile '${result.profile.slug}'.`);
  writeLine(runtime.stdout, `Restored to: ${result.targetPath}`);
  writeLine(runtime.stdout, `Restored from: ${result.restoredFrom}`);
  if (result.backupPath) {
    writeLine(runtime.stdout, `Current state backup: ${result.backupPath}`);
  }
  return 0;
}

async function handleProfileSync(parsed: ParsedArgs, runtime: CommandRuntime): Promise<number> {
  const slug = parsed.positional[0];
  if (!slug) {
    throw new Error("Usage: myai profile sync <slug> --to codex");
  }

  const targetTool = requireStringFlag(parsed, "to");
  if (targetTool !== "codex") {
    throw new Error("v0.1 only supports `--to codex`.");
  }

  const repoPath = await resolveRepoPath(runtime.cwd, runtime.env, getStringFlag(parsed, "repo"));
  const result = await syncProfileToCodex({
    repoPath,
    slug: slugify(slug),
    scope: getScopeFlag(parsed),
    homeDir: getHomeDir(runtime.env),
    targetConfigPath: resolveCodexConfigPath(runtime.env, getStringFlag(parsed, "target-config"), runtime.cwd),
    env: runtime.env,
  });

  writeLine(runtime.stdout, `Synced profile '${result.profile.slug}' to ${result.targetConfigPath}`);
  writeLine(runtime.stdout, `Synced MCP servers: ${result.syncedServers.join(", ") || "(none)"}`);
  printWarnings(runtime, result.warnings);
  return 0;
}

async function handleBootstrap(parsed: ParsedArgs, runtime: CommandRuntime): Promise<number> {
  const slug = parsed.positional[0];
  if (!slug) {
    throw new Error(
      "Usage: myai bootstrap <slug> [--scope team|personal] [--target-dir path] [--target-config path] [--yes]",
    );
  }

  const repoPath = await resolveRepoPath(runtime.cwd, runtime.env, getStringFlag(parsed, "repo"));
  const resolvedSlug = slugify(slug);
  const resolvedScope = getScopeFlag(parsed) ?? "team";
  const targetConfigPath = resolveCodexConfigPath(runtime.env, getStringFlag(parsed, "target-config"), runtime.cwd);
  const startedAt = Date.now();
  let profile: Profile | undefined;

  try {
    profile = await loadProfile(repoPath, resolvedSlug, resolvedScope);
    const syncPreview = await getCodexSyncPreview({
      repoPath,
      profile,
      env: runtime.env,
      targetConfigPath,
    });

    const result = await applyProfile({
      repoPath,
      slug: profile.slug,
      scope: profile.scope,
      profile,
      targetDir: resolveTargetDir(parsed, runtime),
      runtime,
      yes: getBooleanFlag(parsed, "yes"),
      eventName: "bootstrap",
      recordEvent: false,
      previewAppendices: syncPreview ? [syncPreview.previewDocument] : undefined,
      appliedAppendices: syncPreview ? [syncPreview.previewDocument] : undefined,
    });

    const syncResult = syncPreview
      ? await syncProfileToCodex({
          repoPath,
          slug: result.profile.slug,
          scope: result.profile.scope,
          profile: result.profile,
          homeDir: getHomeDir(runtime.env),
          targetConfigPath,
          env: runtime.env,
        })
      : null;

    await appendProfileOutcomeEvent({
      repoPath,
      event: "bootstrap",
      slug: resolvedSlug,
      scope: resolvedScope,
      profile: result.profile,
      status: syncResult?.status ?? "success",
      targetTool: syncResult ? "codex" : undefined,
      durationMs: elapsedMs(startedAt),
      env: runtime.env,
      message: syncResult
        ? `bootstrap applied to ${result.targetPath} and codex synced to ${syncResult.targetConfigPath}`
        : `bootstrap applied to ${result.targetPath}`,
    });

    writeLine(runtime.stdout, `Bootstrapped ${result.profile.scope} profile '${result.profile.slug}'.`);
    writeLine(runtime.stdout, `Applied to: ${result.targetPath}`);
    if (result.backupPath) {
      writeLine(runtime.stdout, `Backup: ${result.backupPath}`);
    }
    writeLine(runtime.stdout, `Preview: ${result.previewPath}`);
    writeLine(runtime.stdout, `Rendered bundle: ${result.bundlePath}`);
    printWarnings(runtime, result.warnings);
    if (syncResult) {
      writeLine(runtime.stdout, `Codex config: ${syncResult.targetConfigPath}`);
      writeLine(runtime.stdout, `Synced MCP servers: ${syncResult.syncedServers.join(", ") || "(none)"}`);
      printWarnings(runtime, syncResult.warnings);
    }
    return 0;
  } catch (error) {
    await appendProfileOutcomeEvent({
      repoPath,
      event: "bootstrap",
      slug: resolvedSlug,
      scope: resolvedScope,
      profile,
      status: "failure",
      targetTool: profile?.sync?.targets.includes("codex") ? "codex" : undefined,
      durationMs: elapsedMs(startedAt),
      env: runtime.env,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function handleReportSummary(parsed: ParsedArgs, runtime: CommandRuntime): Promise<number> {
  const format = getStringFlag(parsed, "format") ?? "text";
  if (format !== "text" && format !== "json") {
    throw new Error("Report format must be either 'text' or 'json'.");
  }

  const repoPath = await resolveRepoPath(runtime.cwd, runtime.env, getStringFlag(parsed, "repo"));
  const summary = await summarizeEvents({
    repoPath,
    since: getStringFlag(parsed, "since"),
  });

  if (format === "json") {
    writeLine(runtime.stdout, JSON.stringify(summary, null, 2));
    return 0;
  }

  runtime.stdout.write(formatReportSummary(summary));
  return 0;
}

async function handleReport(argv: string[], runtime: CommandRuntime): Promise<number> {
  const [subcommand, ...rest] = argv;
  const parsed = parseArgs(rest);

  switch (subcommand) {
    case "summary":
      return handleReportSummary(parsed, runtime);
    case "help":
      writeLine(runtime.stdout, REPORT_USAGE);
      return 0;
    default:
      throw new Error(REPORT_USAGE);
  }
}

async function handleProfile(argv: string[], runtime: CommandRuntime): Promise<number> {
  const [subcommand, ...rest] = argv;
  const parsed = parseArgs(rest);

  switch (subcommand) {
    case "import":
      return handleProfileImport(parsed, runtime);
    case "list":
      return handleProfileList(parsed, runtime);
    case "show":
      return handleProfileShow(parsed, runtime);
    case "search":
      return handleProfileSearch(parsed, runtime);
    case "apply":
      return handleProfileApply(parsed, runtime);
    case "rollback":
      return handleProfileRollback(parsed, runtime);
    case "sync":
      return handleProfileSync(parsed, runtime);
    case "help":
      writeLine(runtime.stdout, PROFILE_USAGE);
      return 0;
    default:
      throw new Error(PROFILE_USAGE);
  }
}

export async function runCli(
  argv: string[],
  runtimeOverrides?: Partial<CommandRuntime>,
): Promise<number> {
  const runtime = createRuntime(runtimeOverrides);
  const [command, ...rest] = argv;

  try {
    switch (command) {
      case "init":
        return await handleInit(parseArgs(rest), runtime);
      case "profile":
        return await handleProfile(rest, runtime);
      case "bootstrap":
        return await handleBootstrap(parseArgs(rest), runtime);
      case "report":
        return await handleReport(rest, runtime);
      case "help":
        printHelp(runtime);
        return 0;
      case undefined:
        printHelp(runtime);
        return 0;
      default:
        throw new Error(`Unknown command '${command}'.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeLine(runtime.stderr, `Error: ${message}`);
    return 1;
  }
}
