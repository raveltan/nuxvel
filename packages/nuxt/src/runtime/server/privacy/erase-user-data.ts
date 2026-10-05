import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { eq, inArray } from "drizzle-orm";
import { useRuntimeConfig } from "nitropack/runtime";
import userData from "#nuxvel/user-data";
import { actorContext } from "../actions/context";
import { systemActor } from "../actions/system-actor";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { transaction } from "../database/transaction";
import { audit } from "../utils/audit";
import type { UserData } from "./define-user-data";
import { userDataTables } from "./user-data-tables";
import { runErasureSteps } from "./erasure-steps";

const declarations: readonly UserData[] = userData;
const execFileAsync = promisify(execFile);

async function recordErasure(command: string, userId: string) {
  const [program = "", ...args] = command.split(" ").filter((part) => part !== "");

  await execFileAsync(program, [...args, userId]).catch((error: { stderr?: string; message: string }) => {
    throw new Error(`eraseUserData: the erasure log command failed, nothing was erased: ${error.stderr?.trim() || error.message}`);
  });
}

/**
 * Deletes every row declared as the user's personal data with
 * {@link defineUserData}, in one transaction, and returns how many rows
 * each table lost.
 *
 * Auto-imported on the server; `nuxvel user:erase <id>` runs it. Tables
 * are erased in the order their `server/privacy/` files sort in; a table
 * declared more than once loses the rows matching any of its declared
 * columns. Throws when the app declares no user data, rather than
 * reporting an erasure that removed nothing. With `nuxvel.billing` on,
 * it first cancels the user's active Stripe subscriptions, and throws
 * without erasing when Stripe refuses; the billing rows stay, for
 * accounting. With `NUXT_ERASURE_LOG_COMMAND`
 * set, it first runs that command with the user's ID, and throws without
 * erasing when the command fails. Audit
 * rows are never deleted: the erasure itself is audited as `user.erased`
 * with the per-table counts, attributed to the actor in scope or to
 * `systemActor("user-data")`. Then the user's `audit_subjects` row and
 * the `audit_context` rows of the entries the user wrote are deleted, also the entries written with one of the user's API keys, so
 * the audit log no longer names the user and its hash chain still
 * verifies.
 *
 * @example
 * ```ts
 * const erased = await eraseUserData(user.id);
 * // { posts: 3, user: 1 }
 * ```
 */
export async function eraseUserData(userId: string): Promise<Record<string, number>> {
  const tables = userDataTables(declarations);

  if (tables.length === 0) {
    throw new Error(
      "eraseUserData: no user data is declared. Add a defineUserData file under server/privacy/ for each table holding a user's rows.",
    );
  }

  await runErasureSteps(userId);

  const { erasureLogCommand } = useRuntimeConfig();
  if (erasureLogCommand) await recordErasure(erasureLogCommand, userId);

  return actorContext.run(actorContext.getStore() ?? systemActor("user-data"), () =>
    transaction(async () => {
      const erased: Record<string, number> = {};
      const apiKeys = schemaTable("api_keys");
      const keys = await useDb().select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.userId, userId));

      for (const { name, table, belongsTo } of tables) {
        const rows = await useDb().delete(table).where(belongsTo(userId)).returning();
        erased[name] = rows.length;
      }

      await audit("user.erased", { id: userId }, { metadata: { erased } });

      const auditSubjects = schemaTable("audit_subjects");
      const auditContext = schemaTable("audit_context");
      const auditLog = schemaTable("audit_log");
      const subjects = await useDb()
        .delete(auditSubjects)
        .where(eq(auditSubjects.userId, userId))
        .returning({ id: auditSubjects.id });

      await useDb()
        .delete(auditContext)
        .where(
          inArray(
            auditContext.entryId,
            useDb().select({ id: auditLog.id }).from(auditLog).where(inArray(auditLog.actorId, [...subjects, ...keys].map((row) => row.id))),
          ),
        );

      return erased;
    }),
  );
}
