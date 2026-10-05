import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { runProbeOnce } from "./helpers/probe";

describe("sanitizeHtml()", async () => {
  await setupPlayground();
  const probe = runProbeOnce<{ basic: string; rich: string }>("/api/_sanitize-html-check");

  it("strips scripts, event handlers and javascript: links, keeps the allowlisted markup and sets the link rel", () => {
    expect(probe().basic).toBe(
      '<p>Hello <strong>world</strong></p><a rel="nofollow ugc noopener">bad</a> <a href="https://example.com" rel="nofollow ugc noopener">good</a>Title',
    );
  });

  it("keeps headings in the rich profile", () => {
    expect(probe().rich).toBe(
      '<p>Hello <strong>world</strong></p><a rel="nofollow ugc noopener">bad</a> <a href="https://example.com" rel="nofollow ugc noopener">good</a><h2>Title</h2>',
    );
  });
});
