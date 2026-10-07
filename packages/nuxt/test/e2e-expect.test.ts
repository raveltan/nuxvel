import { describe, it } from "vitest";
import { alert, button, cell, dialog, expect, field, fillForm, guest, heading, link, text, toast, visit } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("expect from @nuxvel/nuxt/testing", async () => {
  await setupPlayground({ browser: true });

  it("sends a value to the Vitest expect, with the nuxvel matchers and the asymmetric matchers", async () => {
    await expect(guest().api.account.signUps()).rejects.toBeTrpcError("UNAUTHORIZED");
    expect({ id: 7, title: "Hi" }).toEqual({ id: expect.any(Number), title: "Hi" });
    expect(() => expect(1).toBe(2)).toThrow(/expected 1 to be 2/);
  });

  it("sends a locator and a page to the Playwright expect", async () => {
    const page = await visit("/");
    await page.evaluate(() => {
      document.body.insertAdjacentHTML("beforeend", "<p id=gone>going</p>");
      setTimeout(() => {
        document.body.insertAdjacentHTML("beforeend", "<p id=later>visible</p>");
        document.querySelector("#gone")?.remove();
      }, 500);
    });

    await expect(page.locator("#later")).toBeVisible();
    await expect(page.locator("#gone")).not.toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  it("retries a locator assertion until the page changes", async () => {
    const page = await visit("/");
    await page.evaluate(() => {
      setTimeout(() => {
        document.body.insertAdjacentHTML("beforeend", "<p id=late>arrived</p>");
      }, 500);
    });

    await expect(page.locator("#late")).toHaveText("arrived");
  });

  it("fails with the received value when the assertion never passes", async () => {
    const page = await visit("/");

    await expect(expect(page.locator("body")).toHaveText("never shown", { timeout: 300 })).rejects.toThrow(
      /toHaveText[\s\S]*Received[\s\S]*Timeout: {2}300ms/,
    );
  });

  it("times out actions and assertions after nuxvelBrowserTimeout, not Playwright's 30 s", async () => {
    const page = await visit("/");
    const missing = page.locator("#missing");

    await Promise.all([
      expect(missing.click()).rejects.toThrow(/Timeout 5000ms exceeded/),
      expect(expect(missing).toBeVisible()).rejects.toThrow(/with timeout 5000ms/),
      expect(missing.click({ timeout: 300 })).rejects.toThrow(/Timeout 300ms exceeded/),
    ]);
  }, 15_000);

  it("passes a layout assertion when the elements are in that position", async () => {
    const page = await visit("/_layout-matchers");
    const [cancel, save] = [button(page, "Cancel"), button(page, "Save")];

    await expect(heading(page, "Layout probe")).toBeAbove(save);
    await expect(save).toBeBelow(heading(page, "Layout probe"));
    await expect(cancel).toBeLeftOf(save);
    await expect(save).toBeRightOf(cancel);
    await expect(cancel).not.toBeRightOf(save);
    await expect(save).not.toBeAbove(cancel);
  });

  it("fails a layout assertion with the positions of both elements", async () => {
    const page = await visit("/_layout-matchers");
    const [cancel, save] = [button(page, "Cancel"), button(page, "Save")];

    await Promise.all([
      expect(expect(save).toBeLeftOf(cancel, { timeout: 300 })).rejects.toThrow(
        /toBeLeftOf[\s\S]*Expected: the element left of the other element[\s\S]*Received: the element at \(top [\d.]+, bottom [\d.]+, left [\d.]+, right [\d.]+\) and the other element at \(top [\d.]+[\s\S]*Timeout: 300ms/,
      ),
      expect(expect(cancel).not.toBeLeftOf(save, { timeout: 300 })).rejects.toThrow(
        /not[\s\S]*toBeLeftOf[\s\S]*Expected: the element not left of the other element/,
      ),
      expect(expect(cancel).toBeAbove(page.locator("#hidden"), { timeout: 300 })).rejects.toThrow(
        /Received: the other element is not visible/,
      ),
      expect(expect(cancel).not.toBeAbove(page.locator("#hidden"), { timeout: 300 })).rejects.toThrow(
        /Received: the other element is not visible/,
      ),
    ]);
  });

  it("retries a layout assertion until the layout changes", async () => {
    const page = await visit("/_layout-matchers");
    await page.evaluate(() => {
      setTimeout(() => {
        document.querySelector("#row")?.classList.add("reversed");
      }, 500);
    });

    await expect(button(page, "Save")).toBeLeftOf(button(page, "Cancel"));
  });

  it("finds elements by what the screen shows", async () => {
    const page = await visit("/_layout-matchers");

    await expect(button(page, "Save")).toHaveId("save");
    await expect(field(page, "Email")).toHaveId("email");
    await expect(link(page, "Layout probe link")).toHaveAttribute("href", "/_layout-matchers");
    await expect(heading(page, "Layout probe")).toHaveText("Layout probe");
    await expect(text(page, "Saved two minutes ago")).toHaveCount(1);
    await expect(cell(page, "Harbour festival")).toHaveCount(1);
    await expect(alert(page)).toHaveText("Post deleted");
    await expect(dialog(page)).toHaveCount(1);
    await expect(button(dialog(page, "Delete post?"), /^delete$/i)).toHaveCount(1);
    await expect(button(dialog(page), "Save")).toHaveCount(0);
  });

  it("matches the whole name with case by default, and a part without case with exact: false", async () => {
    const page = await visit("/_layout-matchers");

    await expect(button(page, "Delete")).toHaveCount(1);
    await expect(button(page, "Delete", { exact: false })).toHaveCount(2);
    await expect(button(page, "delete")).toHaveCount(0);
    await expect(button(page, "delete article", { exact: false })).toHaveText("Delete article 1");
    await expect(text(page, "Saved two minutes")).toHaveCount(0);
    await expect(text(page, "saved TWO minutes", { exact: false })).toHaveCount(1);
    await expect(field(page, "email")).toHaveCount(0);
    await expect(dialog(page, "Delete post")).toHaveCount(0);
    await expect(dialog(page, "delete post", { exact: false })).toHaveCount(1);
    await expect(button(page, /^delete article/i)).toHaveCount(1);
  });

  it("fills each field by its label", async () => {
    const page = await visit("/");
    await page.setContent(
      '<!doctype html><html lang="en"><head><title>Form</title></head><body><main><label>Title <input name="title"></label><label for="b">Body</label><textarea id="b"></textarea></main></body></html>',
    );

    await fillForm(page, { Title: "Hello", Body: "World" });

    await expect(field(page, "Title")).toHaveValue("Hello");
    await expect(field(page, "Body")).toHaveValue("World");
  });

  it("fills the Nuxt UI controls", async () => {
    const page = await visit("/_form-controls");

    await fillForm(page, {
      Name: "Ada",
      Bio: "Hello {world}",
      Role: "Editor",
      Tag: "Blue",
      "Accept terms": true,
      "Notify me": true,
      Plan: "Pro",
      Born: "2001-02-03",
      Starts: "2026-03-14",
    });
    await button(page, "Send").click();

    await expect(page.getByRole("status", { name: "Sent" })).toHaveText(
      JSON.stringify({
        name: "Ada",
        bio: "Hello {world}",
        role: "Editor",
        tag: "Blue",
        terms: true,
        notify: true,
        plan: "Pro",
        born: "2001-02-03",
        starts: "2026-03-14",
      }),
    );
    await expect(fillForm(page, { "Accept terms": "yes" })).rejects.toThrow(/"Accept terms" is a toggle control/);
    await expect(fillForm(page, { Name: true })).rejects.toThrow(/"Name" is a text control/);
  });

  it("finds a toast by its text and dismisses it", async () => {
    const page = await visit("/_toast");
    await button(page, "Save").click();

    await expect(toast(page, "Post saved")).toBeVisible();
    await expect(toast(page, "Your post is live.")).toHaveCount(1);
    await expect(toast(page.locator("body"), "Post saved")).toBeVisible();

    await toast(page, "Post saved").dismiss();

    await expect(toast(page, "Post saved")).toHaveCount(0);
  });
});
