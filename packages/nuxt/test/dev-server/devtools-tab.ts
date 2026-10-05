import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { useTestContext } from "@nuxt/test-utils/e2e";
import { readDevtoolsSections, readySection } from "../helpers/devtools-sections";
import { expect, guest, useRealQueue, visit } from "@nuxvel/nuxt/testing";

type RecentJobs = { counts: Record<string, number>; jobs: { id: string; name: string; state: string }[] };
type AuditEntry = { id: number; action: string; actorType: string; actorId: string };
type Procedure = { path: string; type: string };

type CustomTab = {
  name: string;
  category?: string;
  requireAuth?: boolean;
  view: { type: string; src?: string; persistent?: boolean };
};

const FROM_ANOTHER_MACHINE = { "x-forwarded-for": "203.0.113.5" };

describe("the nuxvel DevTools tab", () => {
  useRealQueue();

  function nuxvelTab() {
    const tabs: CustomTab[] = JSON.parse(
      readFileSync(join(useTestContext().options.nuxtConfig.buildDir ?? "", "devtools-tabs.json"), "utf8"),
    );

    return tabs.find((candidate) => candidate.name === "nuxvel");
  }

  it("streams its sections in order, without a server routes table", async () => {
    const { ids, results } = await readDevtoolsSections();

    expect(ids).toEqual(["requests", "jobs", "audit", "procedures", "sql", "mail", "events", "schedules", "policies", "flags", "channels", "definitions"]);
    expect(readySection<Procedure[]>(results, "procedures")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "post.list", type: "query" }),
        expect.objectContaining({ path: "post.create", type: "mutation" }),
      ]),
    );
  });

  it("lets DevTools style itself on app pages", async () => {
    const response = await guest().fetch("/");

    const directives = (response.headers.get("content-security-policy") ?? "").split(";").map((directive) => directive.trim());

    expect(directives).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("shows the newest audit entry first", async () => {
    await guest().$fetch("/api/_audit-check");

    const { results } = await readDevtoolsSections();

    expect(readySection<AuditEntry[]>(results, "audit")[0]).toMatchObject({
      action: "moderation.hidden",
      actorType: "system",
      actorId: "_audit-check",
    });
  });

  it("reflects a freshly dispatched job's status", async () => {
    await guest().$fetch("/api/_queue-dispatch-check");

    const { results } = await readDevtoolsSections();
    const { counts, jobs } = readySection<RecentJobs>(results, "jobs");

    expect(counts.waiting).toBe(1);
    expect(jobs).toEqual([expect.objectContaining({ name: "_probe.record", state: "waiting" })]);
  });

  it("shows a job's dispatch delay and priority", async () => {
    await guest().$fetch("/api/_dispatch-options-check");

    const { results } = await readDevtoolsSections();
    const { jobs } = readySection<RecentJobs>(results, "jobs");

    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: "delayed", delay: 60_000, priority: 0 }),
        expect.objectContaining({ state: "prioritized", delay: 0, priority: 3 }),
      ]),
    );
  });

  it("serves the tab as a page only its own scripts run in, embeddable by DevTools", async () => {
    const response = await guest().fetch("/_nuxvel/devtools/");
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(response.status).toBe(200);
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toMatch(/script-src 'self'( 'sha256-[^']+')+;/);
    expect(await response.text()).toContain('<div id="__nuxt">');
  });

  it("renders every section and links the queue board", async () => {
    await guest().$fetch("/api/_queue-dispatch-check");

    const page = await visit("/_nuxvel/devtools/");

    await page.locator('[data-section="procedures"][data-status="ready"]').getByText("post.create").waitFor();
    await page.locator('[data-section="jobs"][data-status="ready"]').getByText("_probe.record").waitFor();
    await page.locator('[data-section="audit"][data-status="ready"]').waitFor();
    expect(await page.getByRole("link", { name: "Queue board" }).getAttribute("href")).toBe("/_nuxvel/queue");
  });

  it("closes its stream while the page is hidden and reopens it when shown", async () => {
    const page = await visit("/_nuxvel/devtools/", { allowFailedRequests: ["**/_nuxvel/devtools/api/stream"] });
    const setVisibility = (state: "hidden" | "visible") =>
      page.evaluate((visibility) => {
        Object.defineProperty(document, "visibilityState", { value: visibility, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      }, state);

    await page.locator('[data-stream="open"] [data-section="procedures"][data-status="ready"]').waitFor();

    await setVisibility("hidden");
    await page.locator('[data-stream="closed"]').waitFor();

    await setVisibility("visible");
    await page.locator('[data-stream="open"] [data-section="procedures"][data-status="ready"]').waitFor();
  });

  it("refuses a request forwarded from another machine", async () => {
    const page = await guest().fetch("/_nuxvel/devtools/", { headers: FROM_ANOTHER_MACHINE });
    const stream = await guest().fetch("/_nuxvel/devtools/api/stream", { headers: FROM_ANOTHER_MACHINE });

    expect(page.status).toBe(403);
    expect(stream.status).toBe(403);
  });

  it("hands DevTools a server tab behind its auth whose URL holds no secret", async () => {
    const tab = nuxvelTab();
    const src = tab?.view.src ?? "";

    expect(tab?.requireAuth).toBe(true);
    expect(tab?.category).toBe("server");
    expect(src).toBe("/_nuxvel/devtools/");
    expect(tab?.view.persistent).toBe(false);
    expect(JSON.stringify(tab)).not.toMatch(/secret|[0-9a-f]{32}/);

    const local = await guest().fetch(src);
    const remote = await guest().fetch(src, { headers: FROM_ANOTHER_MACHINE });

    expect(local.status).toBe(200);
    expect(local.headers.getSetCookie()).toEqual([]);
    expect(remote.status).toBe(403);
  });
});
