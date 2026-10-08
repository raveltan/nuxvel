import { z } from "zod";
import type { ConsolaReporter } from "consola/core";
import { defineAction, systemActor } from "@nuxvel/nuxt/server/actions";
import { currentRequestId } from "@nuxvel/nuxt/server/api";
import { useLogger } from "@nuxvel/nuxt/server/observability";

const tracedPing = probeNamed("_action-tracing-check.tracedPing", defineAction({
  input: z.object({}),
  handler: () => "pong",
}));

const tracedValidated = probeNamed("_action-tracing-check.tracedValidated", defineAction({
  input: z.object({ title: z.string().min(1) }),
  handler: () => "never",
}));

export default defineEventHandler(async () => {
  const actor = systemActor("_action-tracing-check");
  const calls: unknown[][] = [];
  const log = useLogger("action");
  const reporter: ConsolaReporter = { log: (line) => calls.push(line.args) };

  log.addReporter(reporter);

  try {
    await tracedPing({}, { actor });
    await tracedValidated({ title: "" }, { actor }).catch(() => undefined);
  } finally {
    log.removeReporter(reporter);
  }

  return { actor, calls, requestId: currentRequestId() };
});
