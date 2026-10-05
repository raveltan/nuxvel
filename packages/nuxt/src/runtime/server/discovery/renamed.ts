import { awaitingName } from "./definition-name";

/**
 * A definition's old name, kept by {@link renamed} in the file the
 * definition moved out of: the name is that old file's path, and
 * `renamedTo` the definition it now points at.
 */
export interface Renamed<Definition = unknown> {
  readonly name: string;
  readonly renamedTo: Definition;
}

/**
 * Keeps a moved definition answering to the name its old path gave it,
 * so what was stored under that name keeps resolving.
 *
 * Auto-imported. Moving a file renames its definition. Export
 * `renamed(definition)` from the old path to keep the old name: queued
 * jobs, outbox rows and queued listener runs under it run the new
 * definition, and a webhook still answers at its old URL. A schedule,
 * flag, experiment or backfill goes on storing under the old name — its
 * BullMQ scheduler, targeting or experiment state, percentage buckets
 * and exposures, cursor — so nothing resets. The old name is left out of
 * `JobName`, `FlagName` and the other name types, so new code uses the
 * new one. A definition takes one alias. Mails, notifications, uploads, channels,
 * events and actions store nothing under their name, and a `renamed()`
 * in their folders stops the server from starting. `nuxvel doctor`
 * names what is still stored under a name nothing defines.
 *
 * @example
 * ```ts
 * // server/jobs/post-notify.job.ts, after the job moved to server/jobs/post/notify.job.ts
 * import { postNotifyJob } from "./post/notify.job";
 *
 * export default renamed(postNotifyJob);
 * ```
 */
export function renamed<Definition extends object>(definition: Definition): Renamed<Definition> {
  const alias: Renamed<Definition> = { name: "", renamedTo: definition };

  return awaitingName(alias, "renamed() alias");
}

/** Whether a discovered entry is a {@link renamed} alias rather than a definition. */
export function isRenamed(entry: unknown): entry is Renamed {
  return typeof entry === "object" && entry !== null && "renamedTo" in entry;
}
