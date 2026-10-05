import { parseEnv } from "node:util";

export async function sharedEnvProblems(contents: string) {
  const { checkEnvironment } = await import("@nuxvel/nuxt/env");

  return checkEnvironment({ ...parseEnv(contents), NODE_ENV: "production" });
}
