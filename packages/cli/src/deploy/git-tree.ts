import { execFileSync } from "node:child_process";

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
}

export function unpushedTree(cwd: string) {
  try {
    if (git(cwd, ["status", "--porcelain"]) !== "") return "has uncommitted changes";

    const commit = git(cwd, ["rev-parse", "--short=7", "HEAD"]);
    if (git(cwd, ["branch", "--remotes", "--contains", "HEAD"]) === "") return `has the commit ${commit}, which is not pushed`;

    return undefined;
  } catch {
    return "is not a git repository with a commit";
  }
}
