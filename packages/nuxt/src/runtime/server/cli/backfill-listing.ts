import { z } from "zod";

/**
 * What the `backfill:status` command writes for the CLI: every backfill
 * that has started, with its progress, its cursor (`null` before its
 * first batch) and when it finished.
 *
 * @internal Shared by the module's `backfill:status` command and
 * `@nuxvel/cli`; not meant for app code.
 */
export const backfillListingSchema = z.object({
  backfills: z.array(
    z.object({
      name: z.string(),
      processed: z.number(),
      total: z.number(),
      cursor: z.unknown(),
      completedAt: z.string().nullable(),
    }),
  ),
});

/** @internal See {@link backfillListingSchema}. */
export type BackfillListing = z.infer<typeof backfillListingSchema>;
