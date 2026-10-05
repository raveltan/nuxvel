import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { useTestContext } from "@nuxt/test-utils/e2e";
import { setupPlayground } from "./helpers/playground";

function repeatedQueryLines() {
  return (useTestContext().serverLogs ?? [])
    .filter((line) => line.includes("n_plus_one_suspected"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("repeated queries on a production server", async () => {
  await setupPlayground();

  it("logs one n_plus_one_suspected warning per route and statement, and answers the request", async () => {
    expect(await guest().$fetch("/api/_repeated-queries-check?times=6&allowed=1")).toEqual({ ok: true });
    expect(await guest().$fetch("/api/_repeated-queries-check?times=6")).toEqual({ ok: true });
    expect(await guest().$fetch("/api/_repeated-queries-check?times=7")).toEqual({ ok: true });
    await guest().$fetch("/api/_logger-check");

    await expect.poll(() => useTestContext().serverLogs?.some((line) => line.includes("logger-check warn"))).toBe(true);
    expect(repeatedQueryLines()).toEqual([
      expect.objectContaining({
        level: "warn",
        tag: "db",
        msg: "n_plus_one_suspected in GET /api/_repeated-queries-check (6 × the same query)",
        route: "GET /api/_repeated-queries-check",
        fingerprint: expect.stringMatching(/^select .* from "posts" where "posts"\."id" = \?/),
        count: 6,
      }),
    ]);
  });
});
