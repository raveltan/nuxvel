import { z } from "zod";

/**
 * What the `flags:list` command writes for the CLI: every flag with its
 * default and stored targeting (`targeting` in words), and every
 * experiment with its variants and whether it runs.
 *
 * @internal Shared by the module's `flags:list` command and
 * `@nuxvel/cli`; not meant for app code.
 */
export const flagsListingSchema = z.object({
  flags: z.array(
    z.object({
      name: z.string(),
      default: z.boolean(),
      percentage: z.number().nullable(),
      roles: z.record(z.string(), z.boolean()),
      targeting: z.string(),
      updatedAt: z.string().nullable(),
      expiresAt: z.string().nullable(),
    }),
  ),
  experiments: z.array(
    z.object({
      name: z.string(),
      variants: z.record(z.string(), z.number()),
      status: z.enum(["not started", "running", "stopped"]),
    }),
  ),
});

/** @internal See {@link flagsListingSchema}. */
export type FlagsListing = z.infer<typeof flagsListingSchema>;

/**
 * What the `flags:stale` command writes for the CLI: each flag past its
 * `expiresAt`, or at 100% for over 30 days, with the date that made it
 * stale (`since`), and the names of all flags, which the CLI checks
 * against the app's source for flags no code references.
 *
 * @internal Shared by the module's `flags:stale` command and
 * `@nuxvel/cli`; not meant for app code.
 */
export const staleFlagsListingSchema = z.object({
  flags: z.array(
    z.object({
      name: z.string(),
      reason: z.enum(["expired", "fully rolled out", "unreferenced"]),
      since: z.string().nullable(),
    }),
  ),
  names: z.array(z.string()),
});

/** @internal See {@link staleFlagsListingSchema}. */
export type StaleFlagsListing = z.infer<typeof staleFlagsListingSchema>;
