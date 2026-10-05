import { spawn } from "node:child_process";

export function runNuxtChild(
  entry: string,
  args: string[],
  cwd: string,
  onOutput: (chunk: string) => void = () => {},
): Promise<void> {
  const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx/esm"), entry, ...args], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  const collect = (chunk: Buffer) => {
    output += String(chunk);
    onOutput(String(chunk));
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(output.trimEnd()));
    });
  });
}
