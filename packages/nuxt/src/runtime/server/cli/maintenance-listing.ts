import { z } from "zod";

/**
 * What the `maintenance:status` command writes for the CLI: whether the
 * app is down and, when it is, the message, the `Retry-After` seconds,
 * when it went down, the allowed IPs and whether a bypass secret is set.
 * Also whether the queue is paused.
 *
 * @internal Shared by the module's `maintenance:status` command and
 * `@nuxvel/cli`; not meant for app code.
 */
export const maintenanceListingSchema = z.discriminatedUnion("down", [
  z.object({ down: z.literal(false), queuePaused: z.boolean() }),
  z.object({
    down: z.literal(true),
    message: z.string(),
    retryAfter: z.number(),
    since: z.string(),
    allow: z.array(z.string()),
    bypass: z.boolean(),
    queuePaused: z.boolean(),
  }),
]);

/** @internal See {@link maintenanceListingSchema}. */
export type MaintenanceListing = z.infer<typeof maintenanceListingSchema>;
