import { getTableName } from "drizzle-orm";
import backfillEntries from "#nuxvel/backfills";
import mails from "#nuxvel/mails";
import rateLimits from "#nuxvel/rate-limits";
import { backfillStoredName } from "../../backfills/registry";
import { useDb } from "../../database/client";
import { schemaTable } from "../../database/schema-table";
import { definitionsIn } from "../../discovery/aliases";
import { BUILT_IN_RATE_LIMITS, sharedLimit } from "../../security/rate-limit-registry";
import { defineDevtoolsSection } from "../define-devtools-section";
import { readableSchema } from "../readable-schema";
import type { Backfill } from "../../backfills/define-backfill";
import type { Mail } from "../../mail/define-mail";
import type { RateLimit } from "../../security/define-rate-limit";
import type { Renamed } from "../../discovery/renamed";
import type { DefinitionsSectionData } from "../../../shared/devtools/sections/definitions";

function byName<Entry extends { name: string }>(entries: Entry[]) {
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function mailCatalog() {
  const registeredMails: readonly Mail[] = mails;

  return byName(registeredMails.map((mail) => ({ name: mail.name, input: readableSchema(mail.input) })));
}

async function backfillCatalog() {
  const registeredBackfills: readonly (Backfill | Renamed<Backfill>)[] = backfillEntries;
  const progress = new Map((await useDb().select().from(schemaTable("backfills"))).map((row) => [row.name, row]));

  return byName(
    definitionsIn(registeredBackfills).map((backfill) => {
      const storedAs = backfillStoredName(backfill);
      const row = progress.get(storedAs);

      return {
        name: backfill.name,
        table: getTableName(backfill.table),
        storedAs: storedAs === backfill.name ? null : storedAs,
        processed: row?.processed ?? null,
        total: row?.total ?? null,
        completed: row ? row.completedAt !== null : false,
      };
    }),
  );
}

function rateLimitCatalog() {
  const registeredRateLimits: readonly RateLimit[] = rateLimits;
  const names = new Set([...registeredRateLimits.map((limit) => limit.name), ...BUILT_IN_RATE_LIMITS.keys()]);

  return byName([...names].map(sharedLimit));
}

let staticCatalog: { mails: ReturnType<typeof mailCatalog>; rateLimits: ReturnType<typeof rateLimitCatalog> } | undefined;

export default defineDevtoolsSection<DefinitionsSectionData>({
  id: "definitions",
  title: "Mail, backfills and rate limits",
  order: 90,
  load: async () => {
    staticCatalog ??= { mails: mailCatalog(), rateLimits: rateLimitCatalog() };

    return { ...staticCatalog, backfills: await backfillCatalog() };
  },
});
