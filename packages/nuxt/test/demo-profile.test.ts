import { beforeAll, describe, it } from "vitest";
import { actingAs, expect, expectAccessible, expectMailSent } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { ensureBucket } from "./helpers/storage";
import { TEST_STORAGE_URL } from "@nuxvel/test-helpers/services";
import { TEST_STORAGE_BUCKET } from "./setup/constants";
import { setupPlayground } from "./helpers/playground";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function profilePage(email: string) {
  return actingAs(await userFactory({ email, name: "Test User" })).visit("/profile");
}

describe("playground demo: profile", async () => {
  await setupPlayground({
    browser: true,
  });

  beforeAll(() => ensureBucket(TEST_STORAGE_BUCKET));

  it("uploads an avatar through <UploadField>, saves its key and shows it from its storage URL", async () => {
    const page = await profilePage("demo-profile-avatar@example.com");
    await expectAccessible(page);
    const save = page.getByRole("button", { name: "Save avatar" });
    expect(await save.isDisabled()).toBe(true);

    await page.locator('input[type="file"]').setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: ONE_PIXEL_PNG,
    });

    await expect.poll(() => save.isEnabled()).toBe(true);
    await save.click();

    const avatar = page.getByRole("img", { name: "Your avatar" });
    await avatar.waitFor();
    const source = new URL((await avatar.getAttribute("src")) ?? "");
    expect(source.origin).toBe(new URL(TEST_STORAGE_URL).origin);
    expect(source.pathname).toMatch(new RegExp(`^/${TEST_STORAGE_BUCKET}/avatars/`));
    await expect
      .poll(() => avatar.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
      .toBe(1);
    await expectAccessible(page);
  });

  it("shows the upload's refusal under the field for a type it does not allow", async () => {
    const page = await profilePage("demo-profile-avatar-refused@example.com");

    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an image"),
    });

    await page.getByText("Must be one of image/png, image/jpeg, image/webp").waitFor();
    expect(await page.getByRole("button", { name: "Save avatar" }).isDisabled()).toBe(true);
    await expectAccessible(page);
  });

  it("queues the welcome mail to the signed-in user's address", async () => {
    const email = "demo-profile-mail@example.com";
    const page = await profilePage(email);

    await page.getByRole("button", { name: "Send me a test mail" }).click();

    await page.getByText(`Welcome mail queued to ${email}.`).waitFor();
    await expectMailSent("welcome", { to: email, name: "Test User" });
    await expectAccessible(page);
  });
});
