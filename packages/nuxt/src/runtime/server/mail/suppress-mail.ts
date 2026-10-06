import { eq } from "drizzle-orm";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";

/** Why an address stopped receiving mail. */
export type MailSuppressionReason = "bounce" | "complaint";

function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

/**
 * Records that `address` bounced or complained, so {@link Mail.send} skips
 * it from now on.
 *
 * Auto-imported on the server. Call it from the handler that receives
 * your mail provider's bounce and complaint events. Recording an address
 * twice keeps the first record. Joins the ambient transaction.
 *
 * @example
 * ```ts
 * await suppressMail(event.recipient, "bounce");
 * ```
 */
export async function suppressMail(
  address: string,
  reason: MailSuppressionReason,
) {
  const mailSuppressions = schemaTable("mail_suppressions");

  await useDb()
    .insert(mailSuppressions)
    .values({ address: normalizeAddress(address), reason })
    .onConflictDoNothing({ target: mailSuppressions.address });
}

/**
 * Whether `address` is on the suppression list.
 *
 * Auto-imported on the server. {@link Mail.send} checks it before
 * queueing anything.
 */
export async function isMailSuppressed(address: string) {
  const mailSuppressions = schemaTable("mail_suppressions");
  const rows = await useDb()
    .select({ id: mailSuppressions.id })
    .from(mailSuppressions)
    .where(eq(mailSuppressions.address, normalizeAddress(address)))
    .limit(1);

  return rows.length > 0;
}
