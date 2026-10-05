import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("defineMail", async () => {
  await setupPlayground();

  it("renders its Vue template through MJML to HTML with the Outlook fallbacks, and to text", async () => {
    const { html, text } = await guest().$fetch<{ html: string; text: string }>("/api/_define-mail-check");

    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("<!--[if mso");
    expect(html).toMatch(/<h1 style="[^"]*">Welcome, Ada!<\/h1>/);
    expect(html).toMatch(/font-size:24px;[^"]*font-weight:700;/);
    expect(html).toContain('bgcolor="#4f46e5"');
    expect(html).toContain("background-color:#f3f4f6");
    expect(html).not.toMatch(/<\/?mj-/);
    expect(text).toContain("WELCOME, ADA!");
    expect(text).toContain("Thanks for signing up.");
    expect(text).toContain("Read the latest posts https://nuxvel.test/posts");
    expect(text).toContain("Sent by nuxvel playground.");
    expect(html).toContain("Your account is ready.");
    expect(text).not.toContain("Your account is ready.");
    expect(text).not.toContain("<");
  });

  it("throws with the tag and the line when the template renders invalid MJML", async () => {
    const { message } = await guest().$fetch<{ message: string | null }>("/api/_mail-invalid-mjml-check");

    expect(message).toContain("The mail template renders invalid MJML");
    expect(message).toMatch(/line \d+, <mj-text>: mj-text cannot be used inside mj-body/);
  });

  it("does not give the recipient to the template, so it does not leak as an attribute", async () => {
    const { html } = await guest().$fetch<{ html: string }>("/api/_define-mail-check");

    expect(html).not.toContain("ada@example.com");
  });

  it("keeps the text that Vue escaped escaped in the HTML part", async () => {
    const { html } = await guest().$fetch<{ html: string }>("/api/_define-mail-escape-check");

    expect(html).toContain("Welcome, &lt;a href=&quot;https://evil.example&quot;&gt;x&lt;/a&gt;");
    expect(html).not.toContain('<a href="https://evil.example"');
    expect(html).not.toContain("<img");
    expect(html).toContain("x&quot; class=&quot;a");
    expect(html).toContain("&amp;lt;b&amp;gt;");
    expect(html).toContain('href="https://nuxvel.test/posts"');
    expect(html).toContain('<a href="https://nuxvel.test/feed?page=1&amp;sort=new">Feed</a>');
  });
});
