import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { cwd, env, maxBuffer: 64 * 1024 * 1024 });
    return { stdout, stderr, output: stdout + stderr, exitCode: 0 };
  } catch (error) {
    const { stdout = "", stderr = "", code } = error as { stdout?: string; stderr?: string; code: number };
    return { stdout, stderr, output: stdout + stderr, exitCode: code };
  }
}
