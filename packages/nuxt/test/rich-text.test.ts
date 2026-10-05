import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

const sent =
  '<p class="x">See <a href="https://example.com">this</a></p><img src="x" onerror="alert(1)"><script>alert(1)</script>';
const stored = '<p>See <a href="https://example.com" rel="nofollow ugc noopener">this</a></p>';

function post(path: string, body: unknown) {
  return guest().fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("richText()", async () => {
  await setupPlayground();
  const probe = runProbeOnce<{ body: string; tooLong: Record<string, string[]> | null }>("/api/_rich-text-check");

  it("parses to sanitized HTML: a javascript: link loses its href and every link gets the ugc rel", () => {
    expect(probe().body).toBe(
      '<p>See <a rel="nofollow ugc noopener">this</a> and <a href="https://example.com" rel="nofollow ugc noopener">that</a></p>',
    );
  });

  it("refuses input over its max length", () => {
    expect(probe().tooLong).toEqual({ body: ["Too big: expected string to have <=200 characters"] });
  });

  it("reaches the schema through /api/trpc and is stored sanitized", async () => {
    const response = await post("/api/trpc/_richTextCheck.save", { json: { body: sent } });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { data: { json: { body: stored } } } });
  });

  it("reaches the schema through the REST endpoint and is stored sanitized", async () => {
    const response = await post("/api/v1/_rich-text", { body: sent });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ body: stored });
  });

  it("reaches the schema through the test caller", async () => {
    expect(await guest().trpc._richTextCheck.save({ body: sent })).toEqual({ body: stored });
  });

  it("keeps the XSS validator on the other API routes", async () => {
    const response = await post("/api/_broadcast-check", { channel: "_probe-public", event: "x", payload: { html: sent } });

    expect(response.status).toBe(400);
  });
});
