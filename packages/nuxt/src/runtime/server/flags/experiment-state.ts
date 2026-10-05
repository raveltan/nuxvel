import { z } from "zod";
import { FLAGS_CHANNEL } from "../../shared/flags/flag-values";
import { actorContext } from "../actions/context";
import { systemActor } from "../actions/system-actor";
import { broadcast } from "../realtime/broadcast";
import { useRedis } from "../redis/client";
import { redisKey } from "../redis/key";
import { audit } from "../utils/audit";
import type { Experiment } from "./define-experiment";
import { type ExperimentName, findExperiment, flagStoredName } from "./registry";
import { parseStoredJson } from "./stored-json";
import { now } from "../clock/now";

/** Whether an experiment is running, and the weights it locked when it started. */
export interface ExperimentState {
  running: boolean;
  /** The variant weights snapshotted by {@link startExperiment}; assignment uses these, not the code's. */
  variants: Record<string, number>;
  startedAt: string;
  stoppedAt?: string;
}

const experimentStateSchema = z.object({
  running: z.boolean(),
  variants: z.record(z.string(), z.number()),
  startedAt: z.string(),
  stoppedAt: z.string().optional(),
});

export function experimentStateKey(name: string) {
  return redisKey(`nuxvel:experiments:${name}`);
}

function experimentName(nameOrExperiment: string | Experiment) {
  return typeof nameOrExperiment === "string" ? nameOrExperiment : nameOrExperiment.name;
}

function storedStateKey(name: string) {
  return experimentStateKey(flagStoredName(findExperiment(name)));
}

export function parseExperimentState(stored: string | null | undefined): ExperimentState | undefined {
  return parseStoredJson(experimentStateSchema, stored);
}

/**
 * An experiment's stored state, or `undefined` when it was never
 * started or what is stored is not a valid state.
 *
 * Auto-imported on the server. `experiment` is an {@link ExperimentName},
 * so a misspelled experiment fails to compile, or the experiment's
 * definition (`$experiments.checkoutCta` or an import).
 */
export async function experimentState(
  experiment: ExperimentName | Experiment,
): Promise<ExperimentState | undefined> {
  return parseExperimentState(await useRedis("durable").get(storedStateKey(experimentName(experiment))));
}

async function saveState(name: string, state: ExperimentState, action: string) {
  await useRedis("durable").set(storedStateKey(name), JSON.stringify(state));
  await actorContext.run(actorContext.getStore() ?? systemActor("flags"), () =>
    audit(action, { id: name }, { changes: { variants: state.variants } }),
  );
  await broadcast(FLAGS_CHANNEL, "changed", { name });
}

/**
 * Starts an experiment: from now on users are assigned its variants and
 * their exposures are recorded.
 *
 * Auto-imported on the server; `nuxvel experiment:start` calls it. The
 * weights are locked at the first start — changing `variants` in code
 * afterwards would reshuffle users, so a running or restarted
 * experiment keeps the weights it started with; ship a new experiment
 * to change them. Audit-logged as `experiment.started`, and announced on
 * the `flags` channel like {@link setFlagTargeting}. Starting a running
 * experiment does nothing. `experiment` is an {@link ExperimentName} or
 * the experiment's definition; an unknown name also throws at runtime.
 *
 * @example
 * ```ts
 * await startExperiment("checkout-cta");
 * await startExperiment($experiments.checkoutCta);
 * ```
 */
export async function startExperiment(experiment: ExperimentName | Experiment): Promise<void> {
  const name = experimentName(experiment);
  const definition = findExperiment(name);
  const current = await experimentState(experiment);

  if (current?.running) return;

  await saveState(
    name,
    {
      running: true,
      variants: current?.variants ?? definition.variants,
      startedAt: now().toISOString(),
    },
    "experiment.started",
  );
}

/**
 * Stops an experiment: everyone gets the control again, and no more
 * exposures are recorded.
 *
 * Auto-imported on the server; `nuxvel experiment:stop` calls it.
 * Audit-logged as `experiment.stopped`. Stopping an experiment that is
 * not running does nothing. `experiment` is an {@link ExperimentName} or
 * the experiment's definition; an unknown name also throws at runtime.
 *
 * @example
 * ```ts
 * await stopExperiment($experiments.checkoutCta);
 * ```
 */
export async function stopExperiment(experiment: ExperimentName | Experiment): Promise<void> {
  const name = experimentName(experiment);
  findExperiment(name);

  const current = await experimentState(experiment);

  if (!current?.running) return;

  await saveState(
    name,
    { ...current, running: false, stoppedAt: now().toISOString() },
    "experiment.stopped",
  );
}
