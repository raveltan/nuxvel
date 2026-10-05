import { z } from "zod";

/**
 * What the `channels` command writes for the CLI: every channel, the
 * `job:<name>` channels included, with whether a guest may listen, how
 * many events its replay buffer holds out of how many it keeps, and how
 * many server processes listen to it in Redis now.
 *
 * @internal Shared by the module's `channels` command and
 * `@nuxvel/cli`; not meant for app code.
 */
export const channelListingSchema = z.object({
  channels: z.array(
    z.object({
      name: z.string(),
      guests: z.boolean(),
      buffered: z.number(),
      replayLimit: z.number(),
      listeningServers: z.number(),
    }),
  ),
});

/** @internal See {@link channelListingSchema}. */
export type ChannelListing = z.infer<typeof channelListingSchema>;
