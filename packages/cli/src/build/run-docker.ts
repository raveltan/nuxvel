import { spawnTool } from "../spawn-tool.ts";
import { error } from "../ui/output.ts";

/**
 * Runs `docker` with the given arguments, streaming its output, and
 * resolves with its exit code. A missing Docker is reported with a hint
 * and resolves `1`; a failing one gets a closing `✖ docker … exited
 * with code N` (or `✖ docker … was killed by <signal>`) line. Ctrl-C
 * stops Docker, then nuxvel the same way, with no closing line.
 */
export async function runDocker(cwd: string, args: string[]) {
  const command = ["docker", ...args.slice(0, 2)].join(" ");
  const exit = await spawnTool("docker", args, { cwd, stdio: "inherit" });

  if (exit.kind === "missing") {
    error("docker is not installed", "Install Docker Desktop: https://docs.docker.com/get-docker/");
    return 1;
  }
  if (exit.kind === "killed") error(`${command} was killed by ${exit.signal}`);
  else if (exit.code !== 0) error(`${command} exited with code ${exit.code}`);

  return exit.code;
}
