import { z } from "zod";

/**
 * What the `schedule:list` command writes for the CLI: every schedule in
 * code and every scheduler in Redis no schedule matches (`orphaned`),
 * with its timing and its next run once registered.
 *
 * @internal Shared by the module's `schedule:list` command and
 * `@nuxvel/cli`; not meant for app code.
 */
export const scheduleListingSchema = z.object({
  schedules: z.array(
    z.object({
      name: z.string(),
      storedAs: z.string(),
      description: z.string().nullable(),
      pattern: z.string().nullable(),
      nextRun: z.string().nullable(),
      orphaned: z.boolean(),
    }),
  ),
});

/** @internal See {@link scheduleListingSchema}. */
export type ScheduleListing = z.infer<typeof scheduleListingSchema>;
