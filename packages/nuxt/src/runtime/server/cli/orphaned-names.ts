import { z } from "zod";

/**
 * What the `orphaned-names` command writes for `nuxvel doctor`: each
 * name something is still stored under that no definition, or
 * `renamed()` alias, answers to.
 *
 * @internal Shared by the module's `orphaned-names` command and
 * `@nuxvel/cli`; not meant for app code.
 */
export const orphanedNamesSchema = z.array(
  z.object({
    kind: z.enum(["queued job", "outbox row", "scheduler", "flag state", "experiment state"]),
    name: z.string(),
    count: z.number(),
  }),
);

/** @internal See {@link orphanedNamesSchema}. */
export type OrphanedNames = z.infer<typeof orphanedNamesSchema>;
