import { parse, stringify } from "yaml";

import { readTextFile, writeTextFile } from "./fs.js";

export async function readYamlFile<T>(filePath: string): Promise<T> {
  const contents = await readTextFile(filePath);
  return parse(contents) as T;
}

export async function writeYamlFile(filePath: string, value: unknown): Promise<void> {
  const contents = stringify(value, {
    aliasDuplicateObjects: false,
    lineWidth: 100,
  });

  await writeTextFile(filePath, contents);
}

