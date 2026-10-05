import { z } from "zod";

/**
 * What the `queue:failed` command writes for the CLI: every job that
 * used up its attempts, with its queue and why its last attempt failed.
 *
 * @internal Shared by the module's `queue:failed` command and
 * `@nuxvel/cli`; not meant for app code.
 */
export const failedJobsListingSchema = z.object({
  jobs: z.array(
    z.object({
      queue: z.string(),
      id: z.string(),
      name: z.string(),
      attempts: z.number(),
      failedAt: z.string().nullable(),
      reason: z.string(),
    }),
  ),
});

/** @internal See {@link failedJobsListingSchema}. */
export type FailedJobsListing = z.infer<typeof failedJobsListingSchema>;
