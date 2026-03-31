import path from "node:path";

import type { McpAsset } from "../types.js";
import { pathExists, readTextFile, writeTextFile } from "./fs.js";
import { slugify } from "./format.js";
import { validateMcpAsset } from "./validation.js";
import { readYamlFile, writeYamlFile } from "./yaml.js";

async function writeUniqueFile(
  repoPath: string,
  relativeDir: string,
  baseName: string,
  extension: string,
  contents: string,
): Promise<string> {
  let attempt = 0;

  while (true) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const relativePath = path.posix.join(relativeDir, `${baseName}${suffix}.${extension}`);
    const fullPath = path.join(repoPath, relativePath);

    if (!(await pathExists(fullPath))) {
      await writeTextFile(fullPath, contents);
      return relativePath;
    }

    if ((await readTextFile(fullPath)) === contents) {
      return relativePath;
    }

    attempt += 1;
  }
}

export async function writeMarkdownAsset(
  repoPath: string,
  relativeDir: string,
  baseName: string,
  contents: string,
): Promise<string> {
  return writeUniqueFile(repoPath, relativeDir, slugify(baseName), "md", contents);
}

export async function writeMcpAsset(
  repoPath: string,
  baseName: string,
  asset: McpAsset,
): Promise<string> {
  const relativeDir = "mcps";
  const fileBase = slugify(baseName);
  const validatedAsset = validateMcpAsset(asset);
  let attempt = 0;

  while (true) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const relativePath = path.posix.join(relativeDir, `${fileBase}${suffix}.yaml`);
    const fullPath = path.join(repoPath, relativePath);

    if (!(await pathExists(fullPath))) {
      await writeYamlFile(fullPath, validatedAsset);
      return relativePath;
    }

    const nextContents = JSON.stringify(validatedAsset);
    const currentContents = JSON.stringify(await readYamlFile<McpAsset>(fullPath));
    if (currentContents === nextContents) {
      return relativePath;
    }

    attempt += 1;
  }
}
