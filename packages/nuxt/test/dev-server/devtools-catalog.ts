import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { openChannelStream } from "../helpers/channel-stream";
import { readDevtoolsSections, readySection } from "../helpers/devtools-sections";

type Named = { name: string };
type Procedure = { path: string; type: string; input: { properties?: Record<string, unknown> } | null };
type CatalogEvent = Named & { listeners: { name: string; mode: string }[] };
type CatalogSchedule = Named & { description: string; storedAs: string | null };
type CatalogPolicy = { table: string; rules: { name: string; allowsSystem: boolean }[] };
type CatalogChannel = Named & { events: string[]; connections: number };
type Definitions = {
  mails: (Named & { input: { properties?: Record<string, unknown> } })[];
  backfills: (Named & { table: string })[];
  rateLimits: (Named & { points: number; seconds: number })[];
};

const serverDir = fileURLToPath(new URL("../../../../playground/server/", import.meta.url));

function playgroundNames(folder: string) {
  return readdirSync(join(serverDir, folder), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => file.slice(0, -".ts".length).replace(/\.[a-z-]+$/, "").split("/").join("."))
    .sort();
}

function names(entries: Named[]) {
  return entries.map((entry) => entry.name).sort();
}

describe("the DevTools registry catalog", () => {
  it("lists every discovered definition of the playground", async () => {
    const { results } = await readDevtoolsSections();
    const definitions = readySection<Definitions>(results, "definitions");

    expect(names(readySection<CatalogEvent[]>(results, "events"))).toEqual(
      [
        ...playgroundNames("events"),
        "nuxvel.billing.disputed",
        "nuxvel.billing.paid",
        "nuxvel.billing.refunded",
        "nuxvel.billing.subscription-changed",
      ].sort(),
    );
    expect(names(readySection<CatalogSchedule[]>(results, "schedules"))).toEqual(
      [...playgroundNames("schedules"), "nuxvel.auth.reencrypt-two-factor", "nuxvel.billing.reconcile", "nuxvel.prune-outbox"].sort(),
    );
    expect(names(readySection<Named[]>(results, "flags"))).toEqual(playgroundNames("flags"));
    expect(names(readySection<CatalogChannel[]>(results, "channels"))).toEqual(
      [...playgroundNames("channels"), "flags", "maintenance"].sort(),
    );
    expect(names(definitions.mails)).toEqual(
      [
        ...playgroundNames("mail"),
        "nuxvel.auth.existing-account",
        "nuxvel.auth.reset-password",
        "nuxvel.auth.security-notice",
        "nuxvel.auth.verify-email",
      ].sort(),
    );
    expect(names(definitions.backfills)).toEqual(playgroundNames("database/backfills"));
    expect(names(definitions.rateLimits)).toEqual([...playgroundNames("rate-limits"), "api-key", "channel-join"].sort());
    expect(readySection<CatalogPolicy[]>(results, "policies").map((policy) => policy.table)).toEqual([
      "health_checks",
      "posts",
    ]);
  });

  it("shows each definition's details", async () => {
    const { results } = await readDevtoolsSections();
    const procedures = readySection<Procedure[]>(results, "procedures");
    const events = readySection<CatalogEvent[]>(results, "events");
    const definitions = readySection<Definitions>(results, "definitions");

    expect(procedures.find((procedure) => procedure.path === "post.create")?.input?.properties).toHaveProperty("title");
    expect(events.find((event) => event.name === "_probe.transformed")?.listeners).toEqual([
      { name: "_record-probe-transformed-queued", mode: "queued", oldNames: [] },
      { name: "_record-probe-transformed-sync", mode: "sync", oldNames: [] },
    ]);
    expect(readySection<CatalogSchedule[]>(results, "schedules")).toContainEqual(
      expect.objectContaining({ name: "_probe.tick", description: "every 2 seconds", storedAs: null }),
    );
    expect(readySection<CatalogPolicy[]>(results, "policies")).toContainEqual({
      table: "health_checks",
      rules: [
        { name: "update", allowsSystem: false },
        { name: "probe", allowsSystem: true },
      ],
    });
    expect(definitions.mails.find((mail) => mail.name === "welcome")?.input.properties).toHaveProperty("to");
    expect(definitions.rateLimits).toContainEqual({ name: "login", points: 4, seconds: 60 });
  });

  it("counts a channel's open connections", async () => {
    const stream = await openChannelStream("_probe-public");

    try {
      await expect
        .poll(async () => {
          const { results } = await readDevtoolsSections();

          return readySection<CatalogChannel[]>(results, "channels").find((channel) => channel.name === "_probe-public");
        })
        .toMatchObject({ connections: 1 });
    } finally {
      stream.close();
    }
  });

  it("renders the catalog sections in the tab", async () => {
    const page = await visit("/_nuxvel/devtools/");

    await page.locator('[data-section="procedures"][data-status="ready"]').getByText("title: string").first().waitFor();
    await page.locator('[data-section="events"][data-status="ready"]').getByText("_probe.happened").waitFor();
    await page.locator('[data-section="schedules"][data-status="ready"]').getByText("every 2 seconds").waitFor();
    await page.locator('[data-section="policies"][data-status="ready"]').getByText("probe (system allowed)").waitFor();
    await page.locator('[data-section="flags"][data-status="ready"]').getByText("probe-rollout").waitFor();
    await page.locator('[data-section="channels"][data-status="ready"]').getByText("_probe-public").waitFor();
    await page.locator('[data-section="definitions"][data-status="ready"]').getByText("welcome").waitFor();
  });
});
