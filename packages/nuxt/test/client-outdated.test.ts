import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it, onTestFinished } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { closeChannelStreams, openStream } from "./helpers/channel-stream";
import { setupPlayground } from "./helpers/playground";

async function callRemovedProcedure(buildId?: string) {
  const response = await guest().fetch("/api/trpc/removedRouter.list", { headers: buildId ? { "x-nuxvel-build": buildId } : {} });
  const body: { error: { json: { data: { code: string; buildId?: string } } } } = await response.json();

  return body.error.json.data;
}

function openChannels(build: string) {
  return openStream(`/api/channels?channels=${encodeURIComponent(JSON.stringify([{ name: "_probe-public" }]))}&build=${build}`);
}

async function currentBuildId() {
  const html = await (await guest().fetch("/")).text();
  const buildId = /buildId:"([^"]+)"/.exec(html)?.[1];

  if (!buildId) throw new Error("the page carries no build ID");

  return buildId;
}

describe("a call from an older build", async () => {
  await setupPlayground({ browser: true });

  it("answers CLIENT_OUTDATED for a removed procedure, and NOT_FOUND to the current build or no build ID", async () => {
    const buildId = await currentBuildId();

    expect(await callRemovedProcedure("an-older-build")).toEqual(expect.objectContaining({ code: "CLIENT_OUTDATED", buildId }));
    expect((await callRemovedProcedure(buildId)).code).toBe("NOT_FOUND");
    expect((await callRemovedProcedure()).code).toBe("NOT_FOUND");
  });

  it("answers a channel connection from an older build with one reload event and ends it, and connects the current build", async () => {
    onTestFinished(closeChannelStreams);

    const outdated = await openChannels("an-older-build");

    expect(await outdated.next()).toEqual({ event: "reload", data: "" });
    expect(await outdated.next()).toBe("ended");

    const current = await openChannels(await currentBuildId());

    expect(await current.next()).toMatchObject({ event: "connected" });
  });

  it("reloads the page on the next navigation", async () => {
    const page = await actingAs(await userFactory({ email: "client-outdated@example.com" })).visit("/");
    await page.evaluate(() => Reflect.set(window, "beforeReload", true));

    await page.route("**/api/trpc/post.list**", (route) =>
      route.continue({
        url: route.request().url().replace("post.list", "removedRouter.list"),
        headers: { ...route.request().headers(), "x-nuxvel-build": "an-older-build" },
      }),
    );
    const outdatedAnswer = page.waitForResponse((response) => response.url().includes("removedRouter.list"));
    await page.getByRole("link", { name: "Open posts" }).click();
    await outdatedAnswer;
    await page.unrouteAll();

    const reloaded = page.waitForEvent("load");
    await page.goBack();
    await reloaded;

    expect(await page.evaluate(() => Reflect.get(window, "beforeReload"))).toBeUndefined();
    expect(new URL(page.url()).pathname).toBe("/");
  });
});
