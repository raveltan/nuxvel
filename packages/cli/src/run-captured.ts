import { withProjectBinPath } from "./project-bin.ts";
import { spawnTool } from "./spawn-tool.ts";
import type { TaskLog } from "./ui/spinner.ts";

export async function runCaptured(
  cwd: string,
  command: string,
  args: string[],
  log: TaskLog,
): Promise<number | "missing"> {
  const exit = await spawnTool(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: withProjectBinPath(cwd),
    onOutput: (chunk) => log.write(chunk),
  });

  if (exit.kind === "missing") return "missing";
  if (exit.kind === "killed") log.write(`killed by ${exit.signal}\n`);

  return exit.code;
}
