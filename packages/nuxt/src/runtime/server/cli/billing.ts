import { writeFile } from "node:fs/promises";
import { asc, eq, isNull } from "drizzle-orm";
import { useDb } from "../database/client";
import { BILLING_PROCESS_JOB_NAME } from "../billing/jobs/billing-job-name";
import { billingEventsTable } from "../billing/tables";
import { toJobPayload } from "../jobs/payload";
import { findJob } from "../jobs/registry";
import { useNuxvelConfig } from "../utils/config";
import type { BillingListing } from "./billing-listing";
import { CommandError, commandSuccess } from "./command-error";

function processingJob() {
  const job = useNuxvelConfig().billing ? findJob(BILLING_PROCESS_JOB_NAME) : undefined;

  if (!job) throw new CommandError("billing is off", { hint: "Set nuxvel: { billing: true } in nuxt.config.ts" });

  return job;
}

export async function runBillingStatus(outFile: string): Promise<number> {
  processingJob();

  const total = await useDb().$count(billingEventsTable);
  const pending = await useDb()
    .select()
    .from(billingEventsTable)
    .where(isNull(billingEventsTable.processedAt))
    .orderBy(asc(billingEventsTable.receivedAt));
  const listing: BillingListing = {
    total,
    pending: pending.map((event) => ({
      id: event.id,
      type: event.type,
      receivedAt: event.receivedAt.toISOString(),
      attempts: event.attempts,
      lastError: event.lastError,
    })),
  };

  await writeFile(outFile, JSON.stringify(listing));

  return 0;
}

export async function runBillingReplay(eventId: string): Promise<number> {
  const job = processingJob();
  const [event] = await useDb().select().from(billingEventsTable).where(eq(billingEventsTable.id, eventId));

  if (!event) throw new CommandError(`no Stripe event "${eventId}" is stored`, { hint: "Run nuxvel billing:status to see the stored events" });

  await useDb().update(billingEventsTable).set({ processedAt: null }).where(eq(billingEventsTable.id, eventId));
  await job.run(toJobPayload(job.version, { eventId }, null));
  commandSuccess(`processed ${event.type} ${eventId} again`);

  return 0;
}
