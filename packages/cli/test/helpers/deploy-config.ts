import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { onTestFinished } from "vitest";

export const hostArch = process.arch === "arm64" ? "arm64" : "amd64";
export const server = { host: "203.0.113.10", user: "deploy", roles: ["web", "worker", "database", "redis", "storage"] };

export function writeDeployConfig(dir: string, environment: string, app = "tasks") {
  writeFileSync(
    join(dir, "nuxvel.deploy.ts"),
    `import { defineDeploy } from "@nuxvel/cli/deploy";

export default defineDeploy({ app: "${app}", environments: { production: ${environment} } });
`,
  );
}

export function clearEnvAfterTest(...names: string[]) {
  onTestFinished(() => {
    for (const name of names) delete process.env[name];
  });
}
