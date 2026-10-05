import { z } from "zod";
import { countOpenStreams } from "../../../../../src/runtime/server/realtime/streams/open-streams";

const querySchema = z.object({ channel: z.string() });

export default defineEventHandler((event) => {
  const { channel } = querySchema.parse(getQuery(event));

  return { open: countOpenStreams(channel) };
});
