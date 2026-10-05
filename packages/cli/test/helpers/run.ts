import { execFile, spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { cliEntry } from "@nuxvel/test-helpers/cli";
import { run } from "@nuxvel/test-helpers/run";
import { repoNodeModules } from "./scratch.ts";

export const execFileAsync = promisify(execFile);
export const cliDir = fileURLToPath(new URL("../..", import.meta.url));
export { cliEntry };

export function runCli(...args: string[]) {
  return runCliAt(cliDir, ...args);
}

export function runCliAt(cwd: string, ...args: string[]) {
  return run("node", [cliEntry, ...args], cwd);
}

export function runCliWithEnv(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]) {
  return run("node", [cliEntry, ...args], cwd, env);
}

export function runBinAt(cwd: string, bin: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return run(join(repoNodeModules, ".bin", bin), args, cwd, env);
}

export async function runCliWithInput(cwd: string, input: string, env: NodeJS.ProcessEnv, ...args: string[]) {
  const child = spawn("node", [cliEntry, ...args], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += String(chunk)));
  child.stderr.on("data", (chunk) => (stderr += String(chunk)));

  child.stdin.end(input);

  const exitCode = await new Promise<number>((resolve) => {
    child.on("exit", (code) => resolve(code ?? 0));
  });

  return { stdout, stderr, output: stdout + stderr, exitCode };
}

function shellQuote(arg: string) {
  return `'${arg.replaceAll("'", "'\\''")}'`;
}

export function runCliInTty(cwd: string, answers: [prompt: string, answer: string][], ...args: string[]) {
  return runCliInTtyWithEnv(cwd, process.env, answers, ...args);
}

export async function runCliInTtyWithEnv(
  cwd: string,
  env: NodeJS.ProcessEnv,
  answers: [prompt: string, answer: string][],
  ...args: string[]
) {
  const command = `stty cols 80 rows 24; exec node ${[cliEntry, ...args].map(shellQuote).join(" ")}`;
  // macOS script(1) dies on tcgetattr of a socket stdin (what node's "pipe" is), so bash feeds it a real pipe
  const child =
    process.platform === "darwin"
      ? spawn("bash", ["-c", 'exec script -q /dev/null sh -c "$0" < <(exec cat)', command], { cwd, env, stdio: ["pipe", "pipe", "pipe"] })
      : spawn("script", ["-qec", command, "/dev/null"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });

  let output = "";
  let answered = 0;
  let from = 0;
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
    for (let next = answers[answered]; next; next = answers[answered]) {
      const found = stripAnsi(output).indexOf(next[0], from);
      if (found === -1) break;
      answered += 1;
      from = found + next[0].length;
      child.stdin.write(`${next[1]}\r`);
    }
  });
  child.stderr.on("data", (chunk) => (output += String(chunk)));

  const exitCode = await new Promise<number>((resolve) => {
    child.on("exit", (code) => resolve(code ?? 0));
  });
  child.stdin.end();

  return { output, exitCode };
}

export function stripAnsi(text: string) {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

export function tableRows(stdout: string) {
  const [header = [], ...rows] = stripAnsi(stdout)
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split(/ {2,}/));

  return { header, rows };
}
