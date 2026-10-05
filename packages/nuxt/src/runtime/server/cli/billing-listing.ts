import { z } from "zod";

/**
 * What the `billing:status` command writes for the CLI: the number of
 * stored Stripe events, and each one that is not processed yet, with
 * its attempts and last error.
 *
 * @internal Shared by the module's `billing:status` command and
 * `@nuxvel/cli`; not meant for app code.
 */
export const billingListingSchema = z.object({
  total: z.number(),
  pending: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      receivedAt: z.string(),
      attempts: z.number(),
      lastError: z.string().nullable(),
    }),
  ),
});

/** @internal See {@link billingListingSchema}. */
export type BillingListing = z.infer<typeof billingListingSchema>;
