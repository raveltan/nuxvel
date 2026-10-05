import { describe, it } from "vitest";
import { createPage, url } from "@nuxt/test-utils/e2e";
import type { Page } from "playwright-core";
import { actingAs, expect, expectAccessible } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { mutateInBrowser } from "./helpers/browser-trpc";
import { setupPlayground } from "./helpers/playground";

async function flashCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === "nuxvel-flash")?.value;
}

async function dismissFlash(page: Page) {
  await page.getByText("Post created", { exact: true }).waitFor();
  await page.getByRole("region").getByRole("button", { name: "Close" }).click();
  await expect.poll(() => page.getByText("Post created", { exact: true }).count()).toBe(0);
}

async function signedInPage(email: string, path: string) {
  return actingAs(await userFactory({ email })).visit(path);
}

describe("playground demo: posts", async () => {
  await setupPlayground({
    browser: true,
  });

  it("creates a post from the form and lists it", async () => {
    const page = await signedInPage("demo-posts-create@example.com", "/posts");

    await page.getByText("No posts yet").waitFor();
    await expectAccessible(page);

    await page.getByRole("link", { name: "New post" }).click();
    await page.waitForURL(url("/posts/new"));
    await expectAccessible(page);

    await page.getByLabel("Title").fill("Hello from the demo");
    await page.getByLabel("Body").fill("First post");
    await page.getByRole("button", { name: "Create post" }).click();

    await page.waitForURL(url("/posts"));
    await page.getByRole("cell", { name: "Hello from the demo", exact: true }).waitFor();
    await page.getByRole("link", { name: "Edit Hello from the demo" }).waitFor();
    await dismissFlash(page);
    await expectAccessible(page);
  });

  it("shows the flash after the redirect and not on the next navigation", async () => {
    const page = await signedInPage("demo-posts-flash@example.com", "/posts/new");

    await page.getByLabel("Title").fill("Flashed post");
    await page.getByRole("button", { name: "Create post" }).click();

    await page.waitForURL(url("/posts"));
    await dismissFlash(page);
    expect(await flashCookie(page)).toBeUndefined();

    await page.getByRole("link", { name: "New post" }).click();
    await page.waitForURL(url("/posts/new"));
    await page.getByRole("link", { name: "Posts" }).first().click();
    await page.waitForURL(url("/posts"));
    await page.getByRole("cell", { name: "Flashed post", exact: true }).waitFor();
    expect(await page.getByText("Post created", { exact: true }).count()).toBe(0);

    await page.goto(url("/posts"), { waitUntil: "hydration" });
    await page.getByRole("cell", { name: "Flashed post", exact: true }).waitFor();
    expect(await page.getByText("Post created", { exact: true }).count()).toBe(0);
  });

  it("shows only the toast of toasted() when the page stays, and no flash on the next navigation", async () => {
    const page = await signedInPage("demo-posts-toasted@example.com", "/_toasted");

    await page.getByLabel("Title").fill("Toasted post");
    await page.getByRole("button", { name: "Add post" }).click();
    await page.getByText("Post added", { exact: true }).waitFor();
    expect(await flashCookie(page)).toBeUndefined();

    await page.getByRole("link", { name: "Posts" }).click();
    await page.waitForURL(url("/posts"));
    await page.getByRole("cell", { name: "Toasted post", exact: true }).waitFor();
    expect(await page.getByText("Post created", { exact: true }).count()).toBe(0);
  });

  it("pages through the posts table and keeps the page in the URL", async () => {
    const page = await signedInPage("demo-posts-pages@example.com", "/");
    for (const title of ["Oldest", "Middle", "Newest"]) {
      await mutateInBrowser(page, "post.create", { title, body: "" });
    }
    await page.context().clearCookies({ name: "nuxvel-flash" });
    await page.goto(url("/posts?perPage=2"), { waitUntil: "hydration" });

    await page.getByRole("cell", { name: "Newest", exact: true }).waitFor();
    expect(await page.getByRole("cell", { name: "Oldest", exact: true }).count()).toBe(0);
    await expectAccessible(page);

    await page.getByRole("link", { name: "Page 2" }).click();
    await page.waitForURL(url("/posts?perPage=2&page=2"));
    await page.getByRole("cell", { name: "Oldest", exact: true }).waitFor();
    expect(await page.getByRole("cell", { name: "Newest", exact: true }).count()).toBe(0);
    await expectAccessible(page);

    await page.goBack();
    await page.waitForURL(url("/posts?perPage=2"));
    await page.getByRole("cell", { name: "Newest", exact: true }).waitFor();
  });

  it("shows a flash on a server-rendered page load", async () => {
    const page = await signedInPage("demo-posts-flash-ssr@example.com", "/");
    await mutateInBrowser(page, "post.create", { title: "Server flash", body: "" });
    expect(await flashCookie(page)).toContain("Post%20created");

    await page.goto(url("/posts"), { waitUntil: "hydration" });

    await page.getByText("Post created", { exact: true }).waitFor();
    expect(await flashCookie(page)).toBeUndefined();
  });

  it("shows a flash on a page that the service worker fetched", async () => {
    const page = await signedInPage("demo-posts-flash-worker@example.com", "/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.goto(url("/"), { waitUntil: "hydration" });
    await mutateInBrowser(page, "post.create", { title: "Worker flash", body: "" });

    const response = await page.goto(url("/posts"), { waitUntil: "hydration" });

    expect(response?.fromServiceWorker()).toBe(true);
    await page.getByText("Post created", { exact: true }).waitFor();
    expect(await flashCookie(page)).toBeUndefined();
  });

  it("searches the posts table as the user types, clears the search, and shows an empty state for no match", async () => {
    const page = await signedInPage("demo-posts-search@example.com", "/");
    for (const title of ["Nuxt tips", "Drizzle notes"]) {
      await mutateInBrowser(page, "post.create", { title, body: "" });
    }
    await page.context().clearCookies({ name: "nuxvel-flash" });
    await page.goto(url("/posts"), { waitUntil: "hydration" });
    await page.getByRole("cell", { name: "Drizzle notes", exact: true }).waitFor();

    await page.getByLabel("Search posts").pressSequentially("nux");
    await page.waitForURL(url("/posts?q=nux"));
    await page.getByRole("cell", { name: "Nuxt tips", exact: true }).waitFor();
    await expect.poll(() => page.getByRole("cell", { name: "Drizzle notes", exact: true }).count()).toBe(0);

    await page.getByRole("button", { name: "Clear search" }).click();
    await page.waitForURL(url("/posts"));
    await page.getByRole("cell", { name: "Drizzle notes", exact: true }).waitFor();
    expect(await page.getByLabel("Search posts").inputValue()).toBe("");

    await page.getByLabel("Search posts").fill("missing");
    await page.getByLabel("Search posts").press("Enter");
    await page.getByText("No posts match your search").waitFor();
    await expectAccessible(page);
  });

  it("shows an invalid title under its field without a request", async () => {
    const page = await signedInPage("demo-posts-invalid@example.com", "/posts/new");
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/trpc/post.create")) requests.push(request.url());
    });

    await page.getByRole("button", { name: "Create post" }).click();

    await expect
      .poll(async () => {
        const ids = await page.getByLabel("Title").getAttribute("aria-describedby");
        return ids ? page.locator(`[id="${ids.split(" ")[0]}"]`).textContent() : null;
      })
      .toMatch(/>=1 characters/);
    await expectAccessible(page);
    expect(requests).toEqual([]);
  });

  it("edits a post through its edit page", async () => {
    const page = await signedInPage("demo-posts-edit@example.com", "/");
    const post = await mutateInBrowser<{ id: number }>(page, "post.create", {
      title: "Draft title",
      body: "Draft body",
    });

    await page.goto(url(`/posts/${post.id}/edit`), { waitUntil: "hydration" });
    await expect.poll(() => page.getByLabel("Title").inputValue()).toBe("Draft title");
    await dismissFlash(page);
    await expectAccessible(page);

    await page.getByLabel("Title").fill("Final title");
    await page.getByRole("button", { name: "Save post" }).click();

    await page.waitForURL(url("/posts"));
    await page.getByRole("cell", { name: "Final title", exact: true }).waitFor();
    await page.getByText("Post saved", { exact: true }).waitFor();
  });

  it("asks before leaving the edit page with unsaved changes", async () => {
    const page = await signedInPage("demo-posts-unsaved@example.com", "/");
    const post = await mutateInBrowser<{ id: number }>(page, "post.create", { title: "Draft title", body: "Draft body" });

    await page.goto(url(`/posts/${post.id}/edit`), { waitUntil: "hydration" });
    await expect.poll(() => page.getByLabel("Title").inputValue()).toBe("Draft title");
    await dismissFlash(page);
    await page.getByLabel("Title").fill("Unsaved title");

    const dismissed = page.waitForEvent("dialog").then(async (dialog) => {
      expect(dialog.message()).toBe("You have unsaved changes. Leave this page?");
      await dialog.dismiss();
    });
    await page.getByRole("link", { name: "Home" }).first().click();
    await dismissed;

    expect(page.url()).toBe(url(`/posts/${post.id}/edit`));

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("link", { name: "Home" }).first().click();
    await page.waitForURL(url("/"));
  });

  it("shows an action's typed failure under the field it maps to", async () => {
    const page = await signedInPage("demo-posts-failure@example.com", "/");
    const post = await mutateInBrowser<{ id: number }>(page, "post.create", {
      title: "Draft title",
      body: "Draft body",
    });

    await page.goto(url(`/posts/${post.id}/edit`), { waitUntil: "hydration" });
    await expect.poll(() => page.getByLabel("Body").inputValue()).toBe("Draft body");
    await page.getByLabel("Body").fill("   ");
    await page.getByRole("button", { name: "Save post" }).click();

    await expect
      .poll(async () => {
        const ids = await page.getByLabel("Body").getAttribute("aria-describedby");
        return ids ? page.locator(`[id="${ids.split(" ")[0]}"]`).textContent() : null;
      })
      .toBe("Body cannot be empty after trimming");
    expect(await page.getByRole("alert").count()).toBe(0);
    expect(page.url()).toBe(url(`/posts/${post.id}/edit`));
  });

  it("hides edit and delete on someone else's post", async () => {
    const author = await signedInPage("demo-posts-author@example.com", "/");
    await mutateInBrowser(author, "post.create", { title: "Author's post", body: "" });

    const reader = await signedInPage("demo-posts-reader@example.com", "/");
    await mutateInBrowser(reader, "post.create", { title: "Reader's post", body: "" });
    await reader.goto(url("/posts"), { waitUntil: "hydration" });

    await reader.getByRole("link", { name: "Edit Reader's post" }).waitFor();
    await dismissFlash(reader);
    await reader.getByRole("cell", { name: "Author's post", exact: true }).waitFor();
    expect(await reader.getByRole("link", { name: "Edit Author's post" }).count()).toBe(0);
    expect(await reader.getByRole("button", { name: "Delete Author's post" }).count()).toBe(0);
    await expectAccessible(reader);
  });

  it("deletes a post after the confirm dialog accepts", async () => {
    const page = await signedInPage("demo-posts-confirm@example.com", "/");
    await mutateInBrowser(page, "post.create", { title: "Delete me", body: "" });
    await page.goto(url("/posts"), { waitUntil: "hydration" });
    await dismissFlash(page);

    await page.getByRole("button", { name: "Delete Delete me" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete post?" });
    await dialog.waitFor();
    await expect.poll(() => dialog.textContent()).toContain('"Delete me" will be deleted.');
    await dialog.evaluate((element) =>
      Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    );
    await expectAccessible(page);

    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect.poll(() => page.getByRole("cell", { name: "Delete me", exact: true }).count()).toBe(0);
    await page.getByText("No posts yet").waitFor();
  });

  it("keeps the post when the confirm dialog is cancelled", async () => {
    const page = await signedInPage("demo-posts-cancel@example.com", "/");
    await mutateInBrowser(page, "post.create", { title: "Stay", body: "" });
    await page.goto(url("/posts"), { waitUntil: "hydration" });
    await dismissFlash(page);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/trpc/post.delete")) requests.push(request.url());
    });
    const deleteButton = page.getByRole("button", { name: "Delete Stay" });

    await deleteButton.click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect.poll(() => page.getByRole("dialog").count()).toBe(0);

    await deleteButton.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
    await expect.poll(() => deleteButton.evaluate((button) => button === document.activeElement)).toBe(true);

    await page.getByRole("cell", { name: "Stay", exact: true }).waitFor();
    expect(requests).toEqual([]);
  });

  it("puts a deleted post back when the server rejects the delete", async () => {
    const page = await createPage();
    await actingAs(await userFactory({ email: "demo-posts-delete@example.com" })).login(page);
    await page.goto(url("/"), { waitUntil: "hydration" });
    await mutateInBrowser(page, "post.create", { title: "Keep me", body: "" });
    await page.goto(url("/posts"), { waitUntil: "hydration" });
    await dismissFlash(page);

    let releaseDelete = () => {};
    const deleteHeld = new Promise<void>((resolve) => {
      releaseDelete = () => resolve();
    });
    await page.route("**/api/trpc/post.delete**", async (route) => {
      await deleteHeld;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            json: {
              message: "Deletes are paused",
              code: -32603,
              data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
            },
          },
        }),
      });
    });

    await page.getByRole("button", { name: "Delete Keep me" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect
      .poll(() => page.getByRole("cell", { name: "Keep me", exact: true }).count())
      .toBe(0);

    releaseDelete();
    await page.getByRole("cell", { name: "Keep me", exact: true }).waitFor();
    await expect.poll(() => page.getByRole("alert").textContent()).toContain("Deletes are paused");
    await expectAccessible(page);

    await page.close();
  });
});
