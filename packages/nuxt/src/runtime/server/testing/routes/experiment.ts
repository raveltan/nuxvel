import { defineEventHandler } from "h3";
import superjson from "superjson";
import { startExperiment, stopExperiment } from "../../flags/experiment-state";
import type { ExperimentName } from "../../flags/registry";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { name, running } = await readSuperjsonBody<{ name: ExperimentName; running: boolean }>(event);

  return superjson.serialize(
    await settle(() => (running ? startExperiment(name) : stopExperiment(name))),
  );
});
