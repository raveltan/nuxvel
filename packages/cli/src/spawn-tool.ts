import { type StdioOptions, spawn } from "node:child_process";
import { constants } from "node:os";

type ToolExit =
  | { kind: "missing" }
  | { kind: "exited"; code: number }
  | { kind: "killed"; code: number; signal: NodeJS.Signals };

const FORWARDED_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

function signalExitCode(signal: NodeJS.Signals) {
  return 128 + (constants.signals[signal] ?? 0);
}

export function spawnTool(
  command: string,
  args: string[],
  options: { cwd: string; stdio: StdioOptions; env?: NodeJS.ProcessEnv; onOutput?: (chunk: string) => void },
): Promise<ToolExit> {
  const child = spawn(command, args, { cwd: options.cwd, stdio: options.stdio, env: options.env ?? process.env });

  if (options.onOutput) {
    const onOutput = options.onOutput;
    child.stdout?.on("data", (chunk) => onOutput(String(chunk)));
    child.stderr?.on("data", (chunk) => onOutput(String(chunk)));
  }

  let interrupted = false;
  const forward = (signal: NodeJS.Signals) => {
    interrupted = true;
    child.kill(signal);
  };
  for (const signal of FORWARDED_SIGNALS) process.on(signal, forward);
  const stopForwarding = () => {
    for (const signal of FORWARDED_SIGNALS) process.off(signal, forward);
  };

  return new Promise((resolve) => {
    child.on("error", () => {
      stopForwarding();
      resolve({ kind: "missing" });
    });
    child.on("close", (code, signal) => {
      stopForwarding();
      const exitCode = signal ? signalExitCode(signal) : (code ?? 1);
      // An interrupted tool ends nuxvel the same way, so the steps after it (the dev server after compose) never start.
      if (interrupted) {
        if (signal) process.kill(process.pid, signal);
        process.exit(exitCode);
      }
      if (signal) resolve({ kind: "killed", code: exitCode, signal });
      else resolve({ kind: "exited", code: exitCode });
    });
  });
}
