import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { type ConsolaReporter, consola } from "consola";
import { afterAll, beforeAll, describe, it } from "vitest";
import { userFactory } from "../../../../playground/server/factories/users.factory";

const warnings: string[] = [];
const nuxvelWarnings: string[] = [];
const reporter: ConsolaReporter = {
  log(entry) {
    if (entry.type !== "warn") return;
    warnings.push(entry.args.join(" "));
    if (entry.tag === "nuxvel") nuxvelWarnings.push(entry.args.join(" "));
  },
};

export const cachedPages = {
  "/": "cached",
  "/protected": "cached",
  "/guarded-tab/**": "cached",
  "/guarded-files/**": "cached",
  "/guarded-me": "cached",
} as const;

export function addProtectedPage(appDir: string) {
  mkdirSync(join(appDir, "app", "pages"), { recursive: true });
  writeFileSync(join(appDir, "app", "app.vue"), "<template><NuxtPage /></template>\n");
  writeFileSync(
    join(appDir, "app", "pages", "protected.vue"),
    '<script setup lang="ts">\ndefinePageMeta({ middleware: "auth" });\n</script>\n\n<template><div>protected</div></template>\n',
  );
  const shapes = {
    "guarded-tab/[[tab]].vue": ["", "guarded tab"],
    "guarded-files/[...path].vue": ["", "guarded files"],
    "guarded-alias.vue": [', alias: ["/guarded-me"]', "guarded alias"],
  } as const;

  for (const [file, [extra, marker]] of Object.entries(shapes)) {
    mkdirSync(join(appDir, "app", "pages", dirname(file)), { recursive: true });
    writeFileSync(
      join(appDir, "app", "pages", file),
      `<script setup lang="ts">\ndefinePageMeta({ middleware: "auth"${extra} });\n</script>\n\n<template><div>${marker}</div></template>\n`,
    );
  }
}

export function recordBuildWarnings() {
  beforeAll(() => consola.addReporter(reporter));
  afterAll(() => consola.removeReporter(reporter));
}

describe("private-page cache guard", () => {
  it("warns at build time about an authed page marked cacheable", () => {
    expect(warnings).toContainEqual(expect.stringContaining("/protected uses the auth middleware"));
    expect(warnings).not.toContainEqual(expect.stringMatching(/^\/ uses/));
  });

  it("warns about nothing else", () => {
    expect([...nuxvelWarnings].sort()).toEqual(
      ["/protected", "/guarded-tab/**", "/guarded-files/**", "/guarded-me"]
        .map((pattern) => `${pattern} uses the auth middleware but its route rules cache it; rendering it with the private preset instead.`)
        .sort(),
    );
  });

  it("keeps caching a public page marked cacheable", async () => {
    const response = await guest().fetch("/");

    expect(response.headers.get("cache-control")).toBe("s-maxage=60, stale-while-revalidate");
  });

  it("renders the authed page private instead of caching it", async () => {
    const signedIn = await actingAs(await userFactory({ email: "private-page-guard@example.com" })).fetch("/protected");

    expect(signedIn.status).toBe(200);
    expect(new URL(signedIn.url).pathname).toBe("/protected");
    expect(signedIn.headers.get("cache-control")).toBe("private, no-store");
    expect(signedIn.headers.get("x-robots-tag")).toBe("noindex");

    const signedOut = await guest().fetch("/protected");

    expect(new URL(signedOut.url).pathname).toBe("/sign-in");
  });

  it("keeps optional-param, catch-all and alias pages of the auth middleware off a cached rule", async () => {
    const client = actingAs(await userFactory({ email: "private-page-guard-shapes@example.com" }));
    for (const path of ["/guarded-tab", "/guarded-tab/billing", "/guarded-files/a/b", "/guarded-me"]) {
      const response = await client.fetch(path);

      expect(response.status, path).toBe(200);
      expect(new URL(response.url).pathname, path).toBe(path);
      expect(response.headers.get("cache-control"), path).toBe("private, no-store");
    }
  });
});
