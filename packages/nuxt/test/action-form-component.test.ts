import { button, expect, field, fillForm, text, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("<ActionForm>", async () => {
  await setupPlayground({ browser: true });

  it("renders the input of each schema field, or the component of nuxvel.form.inputs for its kind, and sends the state", async () => {
    const page = await visit("/_action-form-fields");

    await expect(field(page, "Team id")).toHaveCount(0);
    await expect(field(page, "Contact address")).toHaveAttribute("type", "email");
    await expect(field(page, "Website")).toHaveAttribute("type", "url");
    await expect(field(page, "Title")).toHaveAttribute("placeholder", "A short title");
    await expect(text(page, "Required")).toBeVisible();
    await expect(page.locator("form")).toHaveClass(/probe-form-root/);

    await fillForm(page, {
      Title: "Launch",
      "Contact address": "ada@example.com",
      Bio: "Line one",
      Status: "published",
      Featured: true,
      "Number of seats": "3",
      "Starts on": "2026-03-14",
      "Ends at": "2026-04-01",
      Body: "<p>Hello</p><script>alert(1)</script>",
      Price: "12.50",
    });
    await button(page, "Send").click();

    const sent = page.getByRole("status", { name: "Sent" });
    for (const part of ['"teamId":7', '"title":"Launch"', '"contactEmail":"ada@example.com"', '"bio":"Line one"', '"status":"published"', '"featured":true', '"seats":3', '"startsOn":"2026-03-14"', '"endsAt":"2026-04-01T00:00:00.000Z"', '"body":"<p>Hello</p>"', '"price":1250']) {
      await expect(sent).toContainText(part);
    }
  });

  it("labels a field with the <action path>.fields.<name> translation of the page locale", async () => {
    const page = await visit("/zh/_action-form-fields");

    await expect(field(page, "联系地址")).toHaveAttribute("type", "email");
  });

  it("shows schema errors under their fields without a request", async () => {
    const page = await visit("/_action-form-fields");
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("_actionFormCheck.save")) requests.push(request.url());
    });

    await button(page, "Send").click();

    await expect(field(page, "Title")).toHaveAttribute("aria-invalid", "true");
    await expect(field(page, "Contact address")).toHaveAttribute("aria-invalid", "true");
    expect(requests).toEqual([]);
  });
});
