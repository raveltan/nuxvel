import { expect, guest, visit } from "@nuxvel/nuxt/testing";
import { describe, it, vi } from "vitest";
import { getServerLogs } from "@nuxt/test-utils/e2e";
import { readDevtoolsSections, readySection } from "../helpers/devtools-sections";

type EntrySpan = { type: string; atMs: number; summary: string };
type EntryDetail = { id: string; kind: string; label: string; status: number; spans: EntrySpan[] };
type EntrySummary = { id: string; label: string; spanCount: number; warnings: number; errors: number };
type RequestLine = { tag: string; path: string; requestId: string };

function requestLines() {
  return getServerLogs()
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as RequestLine)
    .filter((line) => line.tag === "request");
}

async function loadPage() {
  const response = await guest().fetch("/_requests-panel");
  const id = response.headers.get("x-nuxvel-debug-id");

  expect(response.status).toBe(200);
  if (!id) throw new Error("the page answered without an X-Nuxvel-Debug-Id header");

  return { id, serverTiming: response.headers.get("server-timing") ?? "" };
}

async function openedEntry(id: string) {
  let entry: EntryDetail | undefined;

  await expect
    .poll(async () => {
      const response = await guest().fetch(`/_nuxvel/devtools/api/entries/${encodeURIComponent(id)}`);
      entry = response.ok ? await response.json() : undefined;
      return entry;
    })
    .toBeDefined();

  if (!entry) throw new Error(`no entry ${id}`);

  return entry;
}

describe("the Requests panel", () => {
  it("keeps a page load's procedure, query and dispatched job in one entry, in order", async () => {
    const { id } = await loadPage();
    const entry = await openedEntry(id);
    const at = (predicate: (span: EntrySpan) => boolean) => entry.spans.findIndex(predicate);

    const query = at((span) => span.type === "db:query" && span.summary.includes('from "posts"'));
    const job = at((span) => span.type === "job:dispatch" && span.summary === "_probe.record");
    const procedure = at((span) => span.type === "trpc:call" && span.summary.startsWith("_requestsPanelCheck.load (query) ok"));

    expect(entry).toMatchObject({ id, kind: "request", label: "GET /_requests-panel", status: 200 });
    expect(query).toBeGreaterThan(-1);
    expect(job).toBeGreaterThan(query);
    expect(procedure).toBeGreaterThan(job);
    expect(entry.spans.map((span) => span.atMs)).toEqual([...entry.spans.map((span) => span.atMs)].sort((a, b) => a - b));

    const listed = await guest().$fetch<EntrySummary[]>("/_nuxvel/test/collected");

    expect(listed.some((candidate) => candidate.label.startsWith("GET /api/trpc/_requestsPanelCheck"))).toBe(false);
  });

  it("logs the SSR tRPC request under the page's request id", async () => {
    const { id } = await loadPage();

    await vi.waitFor(() => {
      const paths = requestLines()
        .filter((line) => line.requestId === id)
        .map((line) => line.path);

      expect(paths).toContain("/_requests-panel");
      expect(paths.some((path) => path.startsWith("/api/trpc/_requestsPanelCheck.load"))).toBe(true);
    });
  });

  it("times the response and counts its spans per type", async () => {
    const { serverTiming } = await loadPage();

    expect(serverTiming).toMatch(/^total;dur=\d+(\.\d)?(, |$)/);
    expect(serverTiming).toContain('trpc-call;desc="1 trpc:call"');
    expect(serverTiming).toContain('job-dispatch;desc="1 job:dispatch"');
    expect(serverTiming).toMatch(/db-query;desc="\d+ db:query"/);
  });

  it("lists the entry in the section and opens it by id in the browser", async () => {
    const { id } = await loadPage();

    await openedEntry(id);

    const { results } = await readDevtoolsSections();

    expect(readySection<EntrySummary[]>(results, "requests")).toContainEqual(
      expect.objectContaining({ id, label: "GET /_requests-panel", spanCount: expect.any(Number) }),
    );

    const page = await visit(`/_nuxvel/devtools/?entry=${encodeURIComponent(id)}`);

    const section = page.locator('[data-section="requests"][data-status="ready"]');
    const detail = section.locator(`[data-entry-detail="${id}"]`);

    await section.locator(`[data-entry-id="${id}"]`).waitFor();
    await detail.locator('[data-span-type="trpc:call"] summary').getByText("_requestsPanelCheck.load").waitFor();
    await detail.locator('[data-span-type="job:dispatch"] summary').getByText("_probe.record").waitFor();
  });

  it("counts the warnings and errors of an entry and badges its row", async () => {
    const response = await guest().fetch("/api/_logger-check");
    const id = response.headers.get("x-nuxvel-debug-id");

    expect(response.status).toBe(200);
    if (!id) throw new Error("the route answered without an X-Nuxvel-Debug-Id header");

    const entry = await openedEntry(id);
    const logged = (level: string[]) => entry.spans.filter((span) => span.type === "log" && level.some((name) => span.summary.includes(`logger-check ${name}`))).length;
    const { results } = await readDevtoolsSections();
    const summary = readySection<EntrySummary[]>(results, "requests").find((candidate) => candidate.id === id);

    expect(logged(["warn"])).toBe(1);
    expect(summary?.warnings).toBe(1);
    expect(summary?.errors).toBeGreaterThanOrEqual(logged(["error", "fatal"]));

    const page = await visit("/_nuxvel/devtools/");

    const row = page.locator(`[data-section="requests"][data-status="ready"] [data-entry-id="${id}"]`);

    await row.locator("[data-entry-warnings]").getByText("1 warning").waitFor();
    await row.locator("[data-entry-errors]").waitFor();
  });
});
