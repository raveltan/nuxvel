import { z } from "zod";
import { defineAction, systemActor } from "@nuxvel/nuxt/server/actions";
import { onCommit } from "@nuxvel/nuxt/server/database";

const ran: string[] = [];

const withFailingHook = probeNamed("_commit-hook-failure-check.withFailingHook", defineAction({
  input: z.object({}),
  handler: async () => {
    await onCommit(() => {
      ran.push("first");
    });
    await onCommit(() => {
      throw new Error("commit hook exploded");
    });
    await onCommit(() => {
      ran.push("last");
    });

    return "committed";
  },
}));

export default defineEventHandler(async () => {
  ran.length = 0;

  const result = await withFailingHook({}, { actor: systemActor("_commit-hook-failure-check") });

  return { result, ran: [...ran] };
});
