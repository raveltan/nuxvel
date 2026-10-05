import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { expect, guest, useRealQueue, visit } from "@nuxvel/nuxt/testing";
import { readDevtoolsSections, readySection } from "../helpers/devtools-sections";
import { TEST_MAILPIT_URL } from "@nuxvel/test-helpers/services";

type MailSection = {
  mailpitUrl: string;
  sent: { total: number; messages: { id: string; to: string[]; subject: string; url: string }[]; error: string | null };
  previews: { name: string; sample: unknown }[];
};

const FROM_ANOTHER_MACHINE = { "x-forwarded-for": "203.0.113.5" };

async function mailSection() {
  const { results } = await readDevtoolsSections();

  return readySection<MailSection>(results, "mail");
}

async function mailpitTotal() {
  const response = await globalThis.fetch(new URL("/api/v1/messages?limit=1", TEST_MAILPIT_URL));

  return ((await response.json()) as { total: number }).total;
}

function postPreview(body: unknown, headers: Record<string, string> = {}) {
  return guest().fetch("/_nuxvel/devtools/api/mail-preview", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("the DevTools mail panel", () => {
  useRealQueue();

  it("lists a sent mail from Mailpit, linked to it", async () => {
    const to = `devtools-${randomUUID()}@nuxvel.test`;

    await guest().$fetch("/api/_send-mail-check", { query: { rolledBack: `rolled-back-${to}`, committed: to } });

    const section = await mailSection();
    const message = section.sent.messages.find((candidate) => candidate.to.includes(to));

    expect(section.mailpitUrl).toBe(TEST_MAILPIT_URL);
    expect(message).toMatchObject({ subject: "Welcome, Ada" });
    expect(message?.url).toBe(`${TEST_MAILPIT_URL}/view/${message?.id}`);
  });

  it("previews a discovered mail with its preview input without sending it", async () => {
    const { previews } = await mailSection();
    const welcome = previews.find((preview) => preview.name === "welcome");
    const before = await mailpitTotal();

    expect(welcome?.sample).toEqual({ to: "ada@example.com", name: "Ada" });
    expect(previews.find((preview) => preview.name === "_probe-checked")?.sample).toEqual({
      to: "someone@example.com",
      name: "Sample",
    });

    const response = await postPreview({ name: "welcome", input: welcome?.sample });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      subject: "Welcome, Ada",
      html: expect.stringContaining("Welcome, Ada!"),
      text: expect.stringContaining("WELCOME, ADA!"),
    });
    expect(await mailpitTotal()).toBe(before);
  });

  it("answers an invalid preview input with the validation error", async () => {
    const response = await postPreview({ name: "welcome", input: { to: "not an address" } });

    expect(response.status).toBe(400);
  });

  it("refuses a preview from another machine, and one not sent as JSON", async () => {
    const remote = await postPreview({ name: "welcome", input: {} }, FROM_ANOTHER_MACHINE);
    const form = await guest().fetch("/_nuxvel/devtools/api/mail-preview", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ name: "welcome", input: {} }),
    });

    expect(remote.status).toBe(403);
    expect(form.status).toBe(415);
  });

  it("renders the preview in a sandboxed frame in the tab", async () => {
    const page = await visit("/_nuxvel/devtools/");

    const section = page.locator('[data-section="mail"][data-status="ready"]');

    await section.getByRole("button", { name: "Preview" }).click();

    const frame = section.getByTitle("Mail preview");

    await frame.waitFor();
    expect(await frame.getAttribute("sandbox")).toBe("");
    await page.frameLocator('iframe[title="Mail preview"]').getByText("Welcome, Sample!").waitFor();
  });
});
