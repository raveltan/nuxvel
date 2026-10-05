import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

function entryFor(lines: string[], requestId: string) {
  const line = lines.find((candidate) => candidate.includes(requestId));

  if (!line) throw new Error(`no log line for ${requestId}`);

  return { line, entry: JSON.parse(line) as Record<string, unknown> };
}

describe("structured request logging", async () => {
  await setupPlayground();

  it("writes one bare JSON line per request with every field present", async () => {
    const { lines } = await guest().$fetch<{ lines: string[] }>(
      "/api/_request-logging-check",
    );
    const { line, entry } = entryFor(lines, "request-logging-request-id");

    expect(line.startsWith("{")).toBe(true);
    expect(line.endsWith("}\n")).toBe(true);
    expect(entry).toMatchObject({
      method: "GET",
      path: "/api/_db-check",
      status: 200,
    });
    expect(typeof entry.durationMs).toBe("number");
    expect(entry.requestId).toBe("request-logging-request-id");
  });

  it("drops the query string and redacts a token in the path", async () => {
    const { lines } = await guest().$fetch<{ lines: string[] }>(
      "/api/_request-logging-check",
    );

    expect(lines.join("")).not.toContain("secret");
    expect(entryFor(lines, "request-logging-reset").entry.path).toBe(
      "/api/auth/reset-password/[redacted]",
    );
  });
});
