import { z } from "zod";

/**
 * What the `queue:versions` command writes for the CLI: the pending jobs
 * grouped by name and payload version, each group with why the code
 * cannot run it (`problem`), if it cannot. A schedule's ticks are one
 * group with `schedule: true` and no version. `delayed` and
 * `prioritized` count the jobs of `count` that wait out a dispatch
 * `delay` or carry a `priority`.
 *
 * @internal Shared by the module's `queue:versions` command and
 * `@nuxvel/cli`; not meant for app code.
 */
export const queueVersionsListingSchema = z.object({
  groups: z.array(
    z.object({
      name: z.string(),
      version: z.number().nullable(),
      schedule: z.boolean(),
      count: z.number(),
      delayed: z.number(),
      prioritized: z.number(),
      problem: z.string().nullable(),
    }),
  ),
});

/** @internal See {@link queueVersionsListingSchema}. */
export type QueueVersionsListing = z.infer<typeof queueVersionsListingSchema>;
