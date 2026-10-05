import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { run } from "./run";

export const cliEntry = fileURLToPath(new URL("../../cli/bin/nuxvel.mjs", import.meta.url));

export interface StartedCli {
  child: ChildProcess;
  output(): string;
  waitForOutput(pattern: string | RegExp, timeout?: number): Promise<string>;
  stop(signal?: NodeJS.Signals): Promise<void>;
}

export interface StartCliOptions {
  env?: NodeJS.ProcessEnv;
  stdin?: "pipe" | "ignore";
  group?: boolean;
}

export function startCli(cwd: string, args: string[], { env = process.env, stdin = "ignore", group = false }: StartCliOptions = {}): StartedCli {
  const child = spawn("node", [cliEntry, ...args], { cwd, env, stdio: [stdin, "pipe", "pipe"], detached: group });
  let output = "";

  child.stdout?.on("data", (chunk) => (output += String(chunk)));
  child.stderr?.on("data", (chunk) => (output += String(chunk)));

  const matches = (pattern: string | RegExp) => (typeof pattern === "string" ? output.includes(pattern) : pattern.test(output));

  return {
    child,
    output: () => output,
    waitForOutput: (pattern, timeout = 60_000) =>
      new Promise((resolve, reject) => {
        const check = () => {
          if (!matches(pattern)) return false;
          clearTimeout(timer);
          child.stdout?.off("data", check);
          child.stderr?.off("data", check);
          child.off("exit", exited);
          resolve(output);
          return true;
        };
        const exited = () => {
          if (!check()) reject(new Error(`nuxvel ${args.join(" ")} exited before printing ${pattern}:\n${output}`));
        };
        const timer = setTimeout(() => {
          child.stdout?.off("data", check);
          child.stderr?.off("data", check);
          child.off("exit", exited);
          reject(new Error(`nuxvel ${args.join(" ")} did not print ${pattern} within ${timeout} ms:\n${output}`));
        }, timeout);

        if (check()) return;
        child.stdout?.on("data", check);
        child.stderr?.on("data", check);
        child.once("exit", exited);
      }),
    stop: async (signal = "SIGTERM") => {
      if (child.exitCode !== null || child.signalCode !== null) return;

      const exited = once(child, "exit");

      if (group && child.pid !== undefined) process.kill(-child.pid, signal);
      else child.kill(signal);
      await exited;
    },
  };
}

export async function migrate(cwd: string, env: NodeJS.ProcessEnv = process.env) {
  const result = await run("node", [cliEntry, "db:migrate"], cwd, env);

  if (result.exitCode !== 0) throw new Error(`nuxvel db:migrate exited ${result.exitCode}:\n${result.output}`);

  return result;
}
