import { defineEventHandler } from "h3";
import superjson from "superjson";
import { now } from "../../clock/now";
import { experimentStateKey } from "../../flags/experiment-state";
import { findExperiment, flagStoredName } from "../../flags/registry";
import { useRedis } from "../../redis/client";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { name, variant } = await readSuperjsonBody<{ name: string; variant: string }>(event);

  return superjson.serialize(
    await settle(async () => {
      const definition = findExperiment(name);
      if (!Object.hasOwn(definition.variants, variant)) {
        throw new Error(`Experiment "${name}" has no variant "${variant}"`);
      }
      const variants = Object.fromEntries(
        Object.keys(definition.variants).map((key) => [key, key === variant ? 1 : 0]),
      );
      await useRedis("durable").set(
        experimentStateKey(flagStoredName(definition)),
        JSON.stringify({ running: true, variants, startedAt: now().toISOString() }),
      );
    }),
  );
});
