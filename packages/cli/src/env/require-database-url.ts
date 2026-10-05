import { fail } from "../ui/fail.ts";

export function requireDatabaseUrl(names: readonly string[]) {
  for (const name of names) {
    const url = process.env[name];
    if (url) return { name, url };
  }

  return fail(`${names.join(" or ")} is not set`, {
    hint: `Set ${names.at(-1)} in .env or the shell, e.g. postgres://user:password@localhost:5432/app`,
  });
}
