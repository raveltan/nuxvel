import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

export const BUILD_DSN = "http://public@127.0.0.1:9/1";

export function writeDotenv(appDir: string) {
  writeFileSync(
    join(appDir, ".env"),
    "NUXT_PUBLIC_SENTRY_DSN=\nNUXT_DATABASE_OWNER_URL=postgres://nobody:nothing@127.0.0.1:9/nowhere\n",
  );
}

describe("an app built by a test next to a developer's .env", () => {
  it("serves without the .env's values, so an empty DSN there leaves the build-time one", async () => {
    const response = await guest().fetch("/");

    expect(response.headers.get("content-security-policy")).toContain("http://127.0.0.1:9");
    expect(process.env.NUXT_PUBLIC_SENTRY_DSN).toBeUndefined();
    expect(process.env.NUXT_DATABASE_OWNER_URL).toBeUndefined();
  });
});
