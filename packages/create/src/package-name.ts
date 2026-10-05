import { basename } from "node:path";

const NPM_NAME_MAX_LENGTH = 214;

export function packageNameFor(targetDir: string) {
  const dirName = basename(targetDir);
  const name = dirName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, NPM_NAME_MAX_LENGTH);

  if (!name) {
    throw new Error(
      `"${dirName}" has no letters or digits to name the app's package after: create it in a directory such as my-app`,
    );
  }

  return name;
}
