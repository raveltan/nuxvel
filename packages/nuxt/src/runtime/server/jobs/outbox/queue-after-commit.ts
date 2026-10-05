import { sql } from "drizzle-orm";
import { useDb } from "../../database/client";
import { schemaTable } from "../../database/schema-table";
import { beforeCommit, onCommit } from "../../database/transaction";
import { publishObserved } from "../../observe/channels";
import type { Actor } from "../../actions/system-actor";
import type { DispatchOptions } from "../../utils/dispatch-after-commit";
import { toJobPayload } from "../payload";

export const OUTBOX_CHANNEL = "nuxvel_outbox";

export async function queueAfterCommit(
  name: string,
  version: number,
  payload: unknown,
  options: DispatchOptions = {},
  dispatcher: Actor | null = null,
) {
  await beforeCommit(async () => {
    await useDb()
      .insert(schemaTable("outbox"))
      .values({ jobName: name, payload: toJobPayload(version, payload, dispatcher), delay: options.delay, priority: options.priority });
    await useDb().execute(sql`select pg_notify(${OUTBOX_CHANNEL}, '')`);
  });

  await onCommit(() => {
    publishObserved("job:dispatch", { name, payload });
  });
}
