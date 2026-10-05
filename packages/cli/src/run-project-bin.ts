import { resolveProjectBin, withProjectBinPath } from "./project-bin.ts";
import { spawnTool } from "./spawn-tool.ts";
import { error } from "./ui/output.ts";

function reportMissing(name: string, installHint: string) {
  error(`Could not run ${name}`, `Install it in this project (${installHint}) and run nuxvel from the project's directory`);
  return 1;
}

export async function runNodeTool(
  cwd: string,
  name: string,
  nodeArgs: string[],
  options: { installHint: string; env?: Record<string, string> },
): Promise<number> {
  const env = { ...withProjectBinPath(cwd), ...options.env };
  const exit = await spawnTool(process.execPath, nodeArgs, { cwd, stdio: "inherit", env });

  if (exit.kind === "missing") return reportMissing(name, options.installHint);
  if (exit.kind === "killed") error(`${name} was killed by ${exit.signal}`);
  else if (exit.code !== 0) error(`${name} exited with code ${exit.code}`);

  return exit.code;
}

export function runProjectBin(
  cwd: string,
  bin: string,
  args: string[],
  options: { installHint: string; env?: Record<string, string> },
) {
  const entry = resolveProjectBin(cwd, bin);

  if (!entry) return Promise.resolve(reportMissing(bin, options.installHint));

  return runNodeTool(cwd, bin, [entry, ...args], options);
}
