import { join } from "node:path";
import type { DeployEnvironment } from "../deploy/define-deploy.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";

const RUNNERS = { amd64: "ubuntu-latest", arm64: "ubuntu-24.04-arm" } as const;

export function ciFiles(cwd: string, envName: string, environment: DeployEnvironment): GeneratedFile[] {
  return [
    {
      path: join(cwd, ".github", "workflows", "deploy.yml"),
      template: "ci-deploy.yml.txt",
      values: { env: envName, arch: environment.arch, runner: RUNNERS[environment.arch] },
    },
  ];
}
