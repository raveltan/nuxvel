import { execFile } from "node:child_process";
import { promisify } from "node:util";

type Publisher = { TargetPort: number; PublishedPort: number };
type ComposeService = { Service: string; State?: string; Health?: string; Labels?: string; Publishers?: Publisher[] | null };

export function parseServices(output: string): ComposeService[] {
  const trimmed = output.trim();
  if (trimmed.startsWith("[")) return JSON.parse(trimmed);
  return trimmed
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

export async function publishedPorts(cwd: string) {
  const { stdout } = await promisify(execFile)("docker", ["compose", "ps", "--format", "json"], { cwd }).catch(() => ({
    stdout: "",
  }));
  const services = parseServices(stdout);

  return (service: string, targetPort: number) =>
    services
      .find((entry) => entry.Service === service)
      ?.Publishers?.find((publisher) => publisher.TargetPort === targetPort && publisher.PublishedPort > 0)
      ?.PublishedPort;
}
