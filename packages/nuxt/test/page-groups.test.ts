import { describe, it } from "vitest";
import { url } from "@nuxt/test-utils/e2e";
import { actingAs, expect, heading, link, visit } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("route groups", async () => {
  await setupPlayground({ browser: true });

  it("sends a signed-out visitor of a page under (app) to the sign-in page", async () => {
    const page = await visit("/_group-app");

    await expect(page).toHaveURL(url("/sign-in"));
  });

  it("renders a page under (app) in the app layout for a signed-in user", async () => {
    const page = await actingAs(await userFactory()).visit("/_group-app");

    await expect(heading(page, "Group app")).toBeVisible();
    await expect(link(page, "Posts")).toBeVisible();
  });

  it("sends a signed-in user away from a page under (guest)", async () => {
    const page = await actingAs(await userFactory()).visit("/_group-guest");

    await expect(page).toHaveURL(url("/"));
  });

  it("runs the own middleware of a page under (app) after auth, not in its place", async () => {
    const signedOut = await visit("/_group-own-meta");
    const signedIn = await actingAs(await userFactory()).visit("/_group-own-meta");

    await expect(signedOut).toHaveURL(url("/sign-in"));
    await expect(signedIn).toHaveURL(url("/"));
  });

  it("runs an inline middleware function of a page under (app) after auth", async () => {
    const signedOut = await visit("/_group-inline");
    const signedIn = await actingAs(await userFactory()).visit("/_group-inline");

    await expect(signedOut).toHaveURL(url("/sign-in"));
    await expect(signedIn).toHaveURL(url("/"));
  });

  it("lets the own layout of a page win over its group", async () => {
    const page = await actingAs(await userFactory()).visit("/_group-own-layout");

    await expect(heading(page, "Group own layout")).toBeVisible();
    await expect(link(page, "Posts")).toHaveCount(0);
  });

  it("sends a signed-out visitor of the localized copy of a page under (app) to the sign-in page of its locale", async () => {
    const page = await visit("/zh/_group-app");

    await expect(page).toHaveURL(url("/zh/sign-in"));
  });

  it.for(["/_layout-static", "/_layout-dynamic"])("renders the definePageMeta layout of %s, a page outside any group", async (path) => {
    const page = await visit(path);

    await expect(link(page, "Posts")).toBeVisible();
  });

  it("applies a group the app adds in nuxvel.pages.groups", async () => {
    const page = await visit("/_group-custom");

    await expect(page).toHaveURL(url("/sign-in"));
  });
});
