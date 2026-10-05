import { randomUUID } from "node:crypto";
import { expect, guest, visit } from "@nuxvel/nuxt/testing";
import { count, eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { describe, it } from "vitest";
import { useTestContext } from "@nuxt/test-utils/e2e";
import { healthChecksTable } from "../../../../playground/server/database/schema/health-check.schema";
import type { CollectedEntry } from "../../src/runtime/server/observe/collector/collected-entry";
import { useTestDatabase } from "../helpers/database";
import { readDevtoolsSections, readySection } from "../helpers/devtools-sections";

type SqlEntry = {
  id: string;
  queries: { index: number; sql: string; durationMs: number; repeated: number; suspected: boolean; repeatReason?: string }[];
};

const WARNING = "N+1 suspected in GET /api/_repeated-queries-check";

async function collectedEntry(id: string) {
  let found: CollectedEntry | undefined;

  await expect
    .poll(
      async () => {
        const entries = await guest().$fetch<CollectedEntry[]>("/_nuxvel/test/collected");
        found = entries.find((entry) => entry.id === id);
        return found;
      },
      { timeout: 20_000 },
    )
    .toBeDefined();

  if (!found) throw new Error(`no collected entry ${id}`);

  return found;
}

async function requestEntry(path: string) {
  const id = randomUUID();

  await guest().$fetch(path, { headers: { "x-request-id": id } });

  return collectedEntry(id);
}

function serverLogs() {
  return useTestContext().serverLogs ?? [];
}

async function logsUntil(from: number, line: string) {
  await expect.poll(() => serverLogs().slice(from).some((logged) => logged.includes(line)), { timeout: 10_000 }).toBe(true);

  return serverLogs().slice(from);
}

function explain(entryId: string, index: number, headers: Record<string, string> = {}) {
  return guest().fetch("/_nuxvel/devtools/api/explain", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ entryId, index }),
  });
}

describe("the SQL panel and N+1 warning", () => {
  const db = useTestDatabase();

  it("times every query and warns once, in SPEC's format, for five identical selects", async () => {
    const from = serverLogs().length;
    const entry = await requestEntry("/api/_repeated-queries-check?times=5");
    const queries = entry.spans.filter((span) => span.type === "db:query");

    expect(queries).toHaveLength(5);
    for (const query of queries) expect(query.data.durationMs).toBeGreaterThanOrEqual(0);

    const logs = await logsUntil(from, `${WARNING} (5 × the same query)`);
    const at = logs.findIndex((line) => line.includes(WARNING));

    expect(logs.filter((line) => line.includes("N+1 suspected"))).toHaveLength(1);
    expect(logs.slice(at + 1, at + 4)).toEqual([
      expect.stringMatching(/^ {2}select .* from "posts" where "posts"\."id" = \$1$/),
      expect.stringMatching(/^ {2}at server\/api\/_repeated-queries-check\.get\.ts:\d+$/),
      expect.stringContaining("allowRepeatedQueries(reason, fn)"),
    ]);
  });

  it("stays quiet inside allowRepeatedQueries and below five repeats", async () => {
    const from = serverLogs().length;
    const allowed = await requestEntry("/api/_repeated-queries-check?times=6&allowed=1");

    await requestEntry("/api/_repeated-queries-check?times=4");
    await requestEntry("/api/_repeated-queries-check?times=7");

    const logs = await logsUntil(from, `${WARNING} (7 × the same query)`);

    expect(logs.filter((line) => line.includes("N+1 suspected"))).toEqual([
      expect.stringContaining(`${WARNING} (7 × the same query)`),
    ]);
    expect(allowed.spans.find((span) => span.type === "db:query")?.data).toMatchObject({
      repeatReason: "the test repeats it on purpose",
    });
  });

  it("lists the recent entries' queries with their repeats flagged", async () => {
    const suspected = await requestEntry("/api/_repeated-queries-check?times=5");
    const allowed = await requestEntry("/api/_repeated-queries-check?times=5&allowed=1");

    const { results } = await readDevtoolsSections();
    const entries = readySection<SqlEntry[]>(results, "sql");

    expect(entries.find((entry) => entry.id === suspected.id)?.queries).toEqual(
      Array.from({ length: 5 }, () => expect.objectContaining({ repeated: 5, suspected: true })),
    );
    expect(entries.find((entry) => entry.id === allowed.id)?.queries).toEqual(
      Array.from({ length: 5 }, () => expect.objectContaining({ suspected: false, repeatReason: expect.any(String) })),
    );
  });

  it("runs EXPLAIN ANALYZE on an INSERT and rolls it back", async () => {
    const name = `explained-${randomUUID()}`;
    const entry = await requestEntry(`/api/_insert-check?name=${name}`);
    const index = entry.spans.findIndex(
      (span) => span.type === "db:query" && span.data.sql.startsWith('insert into "health_checks"'),
    );
    const rows = () =>
      db
        .select({ rows: count() })
        .from(healthChecksTable)
        .where(eq(healthChecksTable.name, name))
        .then(([result]) => result?.rows);

    expect(await rows()).toBe(1);

    const response = await explain(entry.id, index);

    expect(response.status).toBe(200);
    expect((await response.json()).plan).toMatch(/Insert on health_checks[\s\S]*Execution Time/);
    expect(await rows()).toBe(1);
  });

  it("shows the queries in the tab, repeats flagged, with EXPLAIN one click away", async () => {
    const repeated = await requestEntry("/api/_repeated-queries-check?times=5");
    const inserted = await requestEntry(`/api/_insert-check?name=tab-${randomUUID()}`);
    const page = await visit("/_nuxvel/devtools/");

    const section = page.locator('[data-section="sql"][data-status="ready"]');

    await section.locator(`[data-entry="${repeated.id}"]`).click();
    expect(await section.locator('tr[data-suspected="true"]').count()).toBe(5);

    await section.locator(`[data-entry="${inserted.id}"]`).click();
    await section.getByRole("button", { name: "EXPLAIN" }).last().click();
    await section.getByText("Insert on health_checks").waitFor();
  });

  it("explains an inArray over 150 ids with the params it really ran with", async () => {
    const entry = await requestEntry("/api/_in-array-check?count=150");
    const index = entry.spans.findIndex((span) => span.type === "db:query" && span.data.sql.includes('"health_checks"'));
    const span = entry.spans[index];

    expect(span?.type === "db:query" && span.data.params.length).toBe(100);

    const response = await explain(entry.id, index);

    expect(response.status).toBe(200);
    expect((await response.json()).plan).toMatch(/Scan on health_checks[\s\S]*Execution Time/);
  });

  it("refuses to explain an entry that arrived over the Redis stream", async () => {
    const id = `job:forged-${randomUUID()}`;
    const forged: CollectedEntry = {
      id,
      kind: "job",
      label: "forged",
      startedAt: Date.now(),
      durationMs: 1,
      spans: [{ type: "db:query", data: { sql: "select 1", params: [], durationMs: 1 }, atMs: 0 }],
      truncated: false,
    };
    const redis = new Redis(process.env.NUXT_REDIS_URL ?? "");

    try {
      await redis.xadd("nuxvel:devtools:entries", "*", "entry", JSON.stringify(forged));
    } finally {
      redis.disconnect();
    }

    await collectedEntry(id);
    expect((await explain(id, 0)).status).toBe(404);
  });

  it("redacts the params bound to secret-looking columns in a sign-in's queries", async () => {
    const email = `redacted-${randomUUID()}@example.com`;
    const password = "correct-horse-battery-staple";
    const signUpId = randomUUID();
    const signInId = randomUUID();
    const post = (path: string, body: object, id: string) =>
      guest().fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": id },
        body: JSON.stringify(body),
      });

    expect((await post("/api/auth/sign-up/email", { name: "Redacted", email, password }, signUpId)).status).toBe(200);

    const signIn = await post("/api/auth/sign-in/email", { email, password }, signInId);
    const { token } = await signIn.json();

    expect(signIn.status).toBe(200);
    await collectedEntry(signInId);

    const detail = await guest().fetch(`/_nuxvel/devtools/api/entries/${signInId}`).then((response) => response.text());
    const entry: CollectedEntry = JSON.parse(detail);
    const sessionInsert = entry.spans.find(
      (span) => span.type === "db:query" && span.data.sql.startsWith('insert into "session"'),
    );

    if (sessionInsert?.type !== "db:query") throw new Error("the sign-in inserted no session");

    const columns = sessionInsert.data.sql.match(/\(([^)]*)\)/)?.[1]?.split(", ") ?? [];

    expect(sessionInsert.data.params[columns.indexOf('"token"')]).toBe("[redacted]");
    expect(sessionInsert.data.params[columns.indexOf('"user_id"')]).toMatch(/^\w+$/);
    expect(detail).not.toContain(token);

    const signUp = await collectedEntry(signUpId);
    const accountInsert = signUp.spans.find(
      (span) => span.type === "db:query" && span.data.sql.startsWith('insert into "account"'),
    );

    if (accountInsert?.type !== "db:query") throw new Error("the sign-up inserted no account");
    expect(JSON.stringify(accountInsert.data.params)).not.toMatch(/scrypt|\$2[aby]\$|[0-9a-f]{32}:[0-9a-f]{64}/);
    expect(accountInsert.data.params).toContain("[redacted]");
  });

  it("explains only collected queries, as JSON, from this machine", async () => {
    const entry = await requestEntry("/api/_insert-check?name=gated");
    const index = entry.spans.findIndex((span) => span.type === "db:query");

    expect((await explain(entry.id, entry.spans.length + 1)).status).toBe(404);
    expect((await explain(entry.id, index, { "x-forwarded-for": "203.0.113.5" })).status).toBe(403);
    expect(
      (
        await guest().fetch("/_nuxvel/devtools/api/explain", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: JSON.stringify({ entryId: entry.id, index }),
        })
      ).status,
    ).toBe(415);
  });
});
