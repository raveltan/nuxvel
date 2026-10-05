import { addTemplateTestSetup } from "./scratch.ts";
import { createDatabase } from "./database.ts";
import { runBinAt } from "./run.ts";
import { TEST_MAIL_URL, TEST_REDIS_URL, TEST_STORAGE_URL } from "@nuxvel/test-helpers/services";

export async function runAppTests(appDir: string, args: string[], env: Record<string, string> = {}) {
  addTemplateTestSetup(appDir);
  const redisUrl = new URL(TEST_REDIS_URL);
  redisUrl.pathname = `/${2 * (Number(process.env.VITEST_POOL_ID ?? "1") - 1)}`;
  const database = await createDatabase("app-tests");

  try {
    const { stdout, stderr, exitCode } = await runBinAt(appDir, "vitest", ["run", "--maxWorkers=2", ...args], {
      ...process.env,
      NUXT_DATABASE_OWNER_URL: database.url,
      NUXT_REDIS_URL: redisUrl.toString(),
      NUXT_AUTH_SECRET: "app-tests-secret-app-tests-secret-000",
      NUXT_MAIL_URL: TEST_MAIL_URL,
      NUXT_STORAGE_URL: TEST_STORAGE_URL,
      NUXT_STORAGE_BUCKET: "nuxvel-test",
      ...env,
    });

    return { stdout: `${stdout}${stderr}`, exitCode };
  } finally {
    await database.drop();
  }
}
