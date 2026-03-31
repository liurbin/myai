import { readdir } from "node:fs/promises";
import path from "node:path";

import type { Profile, ProfileScope } from "../types.js";
import { pathExists } from "./fs.js";
import { writeYamlFile, readYamlFile } from "./yaml.js";
import { validateProfile } from "./validation.js";

function getScopeDir(scope: ProfileScope): string {
  return path.join("profiles", scope);
}

export function getProfilePath(repoPath: string, slug: string, scope: ProfileScope): string {
  return path.join(repoPath, getScopeDir(scope), `${slug}.yaml`);
}

async function readValidatedProfile(filePath: string): Promise<Profile> {
  return validateProfile(await readYamlFile<unknown>(filePath), filePath);
}

export async function saveProfile(repoPath: string, profile: Profile): Promise<string> {
  const profilePath = getProfilePath(repoPath, profile.slug, profile.scope);
  await writeYamlFile(profilePath, validateProfile(profile, profilePath));
  return profilePath;
}

export async function loadProfile(
  repoPath: string,
  slug: string,
  scope?: ProfileScope,
): Promise<Profile> {
  const candidateScopes: ProfileScope[] = scope ? [scope] : ["team", "personal"];

  for (const candidateScope of candidateScopes) {
    const filePath = getProfilePath(repoPath, slug, candidateScope);
    if (await pathExists(filePath)) {
      return readValidatedProfile(filePath);
    }
  }

  throw new Error(`Profile '${slug}' not found.`);
}

async function loadProfilesFromScope(repoPath: string, scope: ProfileScope): Promise<Profile[]> {
  const dirPath = path.join(repoPath, getScopeDir(scope));
  if (!(await pathExists(dirPath))) {
    return [];
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"));

  return Promise.all(
    files.map((file) => readValidatedProfile(path.join(dirPath, file.name))),
  );
}

export async function listProfiles(repoPath: string, scope?: ProfileScope): Promise<Profile[]> {
  if (scope) {
    return loadProfilesFromScope(repoPath, scope);
  }

  const profiles = await Promise.all([
    loadProfilesFromScope(repoPath, "team"),
    loadProfilesFromScope(repoPath, "personal"),
  ]);

  return profiles.flat().sort((left, right) => left.slug.localeCompare(right.slug));
}

export async function searchProfiles(repoPath: string, query: string): Promise<Profile[]> {
  const normalizedQuery = query.trim().toLowerCase();
  const profiles = await listProfiles(repoPath);

  return profiles.filter((profile) => {
    const haystack = [
      profile.slug,
      profile.name,
      profile.description ?? "",
      ...(profile.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}
