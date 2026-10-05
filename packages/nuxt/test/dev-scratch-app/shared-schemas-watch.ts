import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTestContext } from "@nuxt/test-utils/e2e";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const appDir = () => useTestContext().options.rootDir;

function renderInApp(root: string, name: string) {
  writeFileSync(join(root, "app/app.vue"), `<template><div>{{ ${name} }}</div></template>\n`);
}

function appImports() {
  return readFileSync(join(appDir(), ".nuxt/types/imports.d.ts"), "utf8");
}

async function page() {
  // a request that lands while the nitro worker reloads after a shared/schemas edit never gets a response
  return guest().$fetch<string>("/", { responseType: "text", timeout: 10_000, retry: 0 }).catch(() => "");
}

export function addSharedSchema(root: string) {
  mkdirSync(join(root, "shared/schemas"), { recursive: true });
  writeFileSync(join(root, "shared/schemas/post.ts"), 'export const postSchema = "post-marker";\n');
  renderInApp(root, "postSchema");
}

describe("the dev server with an export added under shared/schemas", () => {
  it("auto-imports a new export of an existing file in the app without a restart", async () => {
    await expect.poll(page, { timeout: 30_000, interval: 250 }).toContain("post-marker");

    writeFileSync(
      join(appDir(), "shared/schemas/post.ts"),
      'export const postSchema = "post-marker";\nexport const commentSchema = "comment-marker";\n',
    );
    await expect.poll(appImports, { timeout: 30_000, interval: 250 }).toContain("commentSchema");
    renderInApp(appDir(), "commentSchema");

    await expect.poll(page, { timeout: 30_000, interval: 250 }).toContain("comment-marker");
  }, 70_000);

  it("auto-imports the export of a new file in the app without a restart", async () => {
    writeFileSync(join(appDir(), "shared/schemas/tag.ts"), 'export const tagSchema = "tag-marker";\n');
    await expect.poll(appImports, { timeout: 30_000, interval: 250 }).toContain("tagSchema");
    renderInApp(appDir(), "tagSchema");

    await expect.poll(page, { timeout: 30_000, interval: 250 }).toContain("tag-marker");
  }, 70_000);
});
