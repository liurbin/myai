import os from "node:os";
import path from "node:path";

import type { RepoConfig } from "../types.js";
import { ensureDir, pathExists } from "./fs.js";
import { readYamlFile, writeYamlFile } from "./yaml.js";

export const REPO_CONFIG_FILE = "myai.yaml";
export const REPO_DIRECTORIES = [
  "prompts",
  "mcps",
  "preferences",
  "profiles/team",
  "profiles/personal",
  "skills",
  "logs",
] as const;

export function getHomeDir(env: NodeJS.ProcessEnv): string {
  return env.HOME ?? os.homedir();
}

export function getDefaultRepoPath(env: NodeJS.ProcessEnv): string {
  return path.join(getHomeDir(env), ".myai");
}

export function resolveInputPath(inputPath: string, cwd: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(cwd, inputPath);
}

export async function findRepoRoot(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);

  while (true) {
    if (await pathExists(path.join(current, REPO_CONFIG_FILE))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

export async function resolveRepoPath(
  cwd: string,
  env: NodeJS.ProcessEnv,
  explicitRepo?: string,
): Promise<string> {
  if (explicitRepo) {
    return resolveInputPath(explicitRepo, cwd);
  }

  const discovered = await findRepoRoot(cwd);
  if (discovered) {
    return discovered;
  }

  const defaultRepo = getDefaultRepoPath(env);
  if (await pathExists(path.join(defaultRepo, REPO_CONFIG_FILE))) {
    return defaultRepo;
  }

  throw new Error("MyAI repository not found. Run `myai init` first or pass `--repo`.");
}

export async function initRepository(repoPath: string): Promise<{
  repoPath: string;
  created: string[];
}> {
  const created: string[] = [];

  await ensureDir(repoPath);

  for (const directory of REPO_DIRECTORIES) {
    const fullPath = path.join(repoPath, directory);
    if (!(await pathExists(fullPath))) {
      await ensureDir(fullPath);
      created.push(directory);
    }
  }

  const configPath = path.join(repoPath, REPO_CONFIG_FILE);
  if (!(await pathExists(configPath))) {
    const config: RepoConfig = {
      version: 1,
      name: path.basename(repoPath) === ".myai" ? "myai" : path.basename(repoPath),
      default_profile_scope: "team",
      supported_targets: ["codex"],
    };
    await writeYamlFile(configPath, config);
    created.push(REPO_CONFIG_FILE);
  }

  return { repoPath, created };
}

export async function readRepoConfig(repoPath: string): Promise<RepoConfig> {
  const configPath = path.join(repoPath, REPO_CONFIG_FILE);
  if (!(await pathExists(configPath))) {
    throw new Error(`Missing ${REPO_CONFIG_FILE} in ${repoPath}.`);
  }

  return readYamlFile<RepoConfig>(configPath);
}

