import { once } from "node:events";
import type { Page } from "playwright-core";
import { describe, it } from "vitest";
import { createPage, url } from "@nuxt/test-utils/e2e";
import { actingAs, expectAccessible } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { mutateInBrowser } from "./helpers/browser-trpc";
import { setupPlayground } from "./helpers/playground";
import { startSecondServer } from "./helpers/second-server";

const HEARTBEAT = { NUXVEL_REALTIME_HEARTBEAT_SECONDS: "1" };

async function visitedAs(name: string) {
  return actingAs(await userFactory({ name })).visit("/");
}

async function signedIn(name: string) {
  const page = await createPage();

  await actingAs(await userFactory({ name })).login(page);

  return page;
}

async function openEditor(page: Page, postId: number, serverUrl = url("/")) {
  const connected = page.waitForResponse((response) => response.url().includes("/api/channels"));

  await page.goto(new URL(`/posts/${postId}/edit`, serverUrl).toString(), { waitUntil: "hydration" });
  await connected;
}

async function createdPost(page: Page, title: string) {
  await page.goto(url("/posts"), { waitUntil: "hydration" });

  const post = await mutateInBrowser<{ id: number }>(page, "post.create", { title, body: "Draft body" });

  await openEditor(page, post.id);
  await page.getByText("Post created", { exact: true }).waitFor();
  await page.getByRole("region").getByRole("button", { name: "Close" }).click();
  await page.getByText("Post created", { exact: true }).waitFor({ state: "detached" });

  return post;
}

function viewer(page: Page, name: string) {
  return page.getByRole("group", { name: "Viewing now" }).getByRole("img", { name });
}

describe("playground demo: who else is editing a post", async () => {
  await setupPlayground({ browser: true, env: HEARTBEAT });

  it("shows another editor join, type and leave", async () => {
    const ada = await visitedAs("Ada");

    const post = await createdPost(ada, "Shared draft");

    const bea = await visitedAs("Bea");

    await openEditor(bea, post.id);
    await viewer(ada, "Bea").waitFor();

    await bea.getByLabel("Title").fill("Shared draft, edited");
    await ada.getByText("Bea is typing…").waitFor();
    await expectAccessible(ada);

    await bea.getByLabel("Title").blur();
    await ada.getByText("Bea is typing…").waitFor({ state: "detached" });

    await bea.close();
    await viewer(ada, "Bea").waitFor({ state: "detached" });
  }, 30_000);

  it("drops an editor whose server stopped once the heartbeat expires", async () => {
    const second = await startSecondServer({ env: HEARTBEAT });

    try {
      const ada = await visitedAs("Ada");

      const post = await createdPost(ada, "Crash draft");

      const cara = await signedIn("Cara");

      await openEditor(cara, post.id, second.url);
      await viewer(ada, "Cara").waitFor();

      second.child.kill("SIGKILL");
      await once(second.child, "exit");

      await viewer(ada, "Cara").waitFor({ state: "detached" });
      await cara.close();
    } finally {
      second.child.kill("SIGKILL");
    }
  }, 60_000);
});
