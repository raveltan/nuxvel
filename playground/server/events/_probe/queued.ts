import { z } from "zod";
import { defineEvent } from "@nuxvel/nuxt/server/events";

const v1 = z.object({ label: z.string().min(1) });

export const probeQueued = defineEvent({
  version: 2,
  upcasters: {
    1: (payload) => ({ name: v1.parse(payload).label }),
  },
  payload: z.object({ name: z.string().min(1) }),
});
