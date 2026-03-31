import os from "node:os";
import path from "node:path";

import type { EventLogEntry } from "../types.js";
import { ensureDir, writeTextFile, pathExists, readTextFile } from "./fs.js";
import { readRepoConfig } from "./repo.js";

interface EventLogContext {
  env?: NodeJS.ProcessEnv;
  actorId?: string;
  machineId?: string;
  repoName?: string;
}

const repoNameCache = new Map<string, string>();

function getLogFileName(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `events-${year}-${month}.jsonl`;
}

function pickFirstNonEmpty(values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim() !== "");
}

function resolveActorId(env: NodeJS.ProcessEnv): string | undefined {
  return pickFirstNonEmpty([env.MYAI_ACTOR_ID, env.USER, env.USERNAME, env.LOGNAME]);
}

function resolveMachineId(env: NodeJS.ProcessEnv): string {
  return pickFirstNonEmpty([env.MYAI_MACHINE_ID, env.HOSTNAME]) ?? os.hostname();
}

async function resolveRepoName(repoPath: string): Promise<string> {
  const cached = repoNameCache.get(repoPath);
  if (cached) {
    return cached;
  }

  try {
    const repoConfig = await readRepoConfig(repoPath);
    repoNameCache.set(repoPath, repoConfig.name);
    return repoConfig.name;
  } catch {
    const fallback = path.basename(repoPath) === ".myai" ? "myai" : path.basename(repoPath);
    repoNameCache.set(repoPath, fallback);
    return fallback;
  }
}

export async function appendEventLog(
  repoPath: string,
  entry: EventLogEntry,
  context?: EventLogContext,
): Promise<void> {
  const logsDir = path.join(repoPath, "logs");
  await ensureDir(logsDir);

  const env = context?.env ?? process.env;
  const enrichedEntry: EventLogEntry = {
    ...entry,
    actor_id: entry.actor_id ?? context?.actorId ?? resolveActorId(env),
    machine_id: entry.machine_id ?? context?.machineId ?? resolveMachineId(env),
    repo_name: entry.repo_name ?? context?.repoName ?? await resolveRepoName(repoPath),
  };

  const logPath = path.join(logsDir, getLogFileName(new Date(enrichedEntry.timestamp)));
  const line = `${JSON.stringify(enrichedEntry)}\n`;

  if (await pathExists(logPath)) {
    const current = await readTextFile(logPath);
    await writeTextFile(logPath, `${current}${line}`);
    return;
  }

  await writeTextFile(logPath, line);
}
