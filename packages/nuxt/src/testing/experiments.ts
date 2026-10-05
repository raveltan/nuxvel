import type { Experiment } from "../runtime/server/flags/define-experiment";
import type { ExperimentName, ExperimentVariant } from "../runtime/server/flags/registry";
import { callApp } from "./settled";

function experimentName(nameOrExperiment: string | Experiment) {
  return typeof nameOrExperiment === "string" ? nameOrExperiment : nameOrExperiment.name;
}

/**
 * Starts an experiment in the app under test, the test-side counterpart
 * of the server's {@link startExperiment}.
 *
 * From then on {@link experiment} assigns users its variants and records
 * their exposures. Each test starts with every experiment stopped
 * (`@nuxvel/nuxt/testing/database` empties Redis after each test). Call
 * {@link stopExperiment} to return everyone to the control within a
 * test.
 *
 * @param experiment An {@link ExperimentName}, or the experiment's
 * definition or its stub from `#nuxvel/test-namespaces`; a name no
 * experiment defines fails to compile.
 *
 * @example
 * ```ts
 * await startExperiment("subscribe-button");
 * await startExperiment($experiments.subscribeButton);
 * ```
 */
export async function startExperiment(experiment: ExperimentName | Experiment): Promise<void> {
  await callApp("experiment", { name: experimentName(experiment), running: true });
}

/**
 * Stops an experiment in the app under test, the test-side counterpart
 * of the server's {@link stopExperiment}: everyone gets the control
 * again.
 *
 * @param experiment An {@link ExperimentName}, or the experiment's
 * definition or its stub from `#nuxvel/test-namespaces`; a name no
 * experiment defines fails to compile.
 *
 * @example
 * ```ts
 * await stopExperiment("subscribe-button");
 * ```
 */
export async function stopExperiment(experiment: ExperimentName | Experiment): Promise<void> {
  await callApp("experiment", { name: experimentName(experiment), running: false });
}

/**
 * Runs an experiment in the app under test with every user in `variant`.
 *
 * The app records exposures as for a running experiment. Each test starts
 * with the experiment stopped. {@link stopExperiment} returns everyone to
 * the control. A later {@link startExperiment} does nothing while the
 * experiment runs.
 *
 * @param experiment An {@link ExperimentName}, or the experiment's
 * definition or its stub from `#nuxvel/test-namespaces`; a name no
 * experiment defines fails to compile.
 * @param variant A variant the experiment defines; another name fails to compile.
 *
 * @example
 * ```ts
 * await forceVariant("subscribe-button", "green");
 * ```
 */
export async function forceVariant<Name extends ExperimentName>(
  experiment: Name,
  variant: ExperimentVariant<Name>,
): Promise<void>;
export async function forceVariant<Variant extends string>(
  experiment: Experiment<string, Variant>,
  variant: Variant,
): Promise<void>;
export async function forceVariant(experiment: string | Experiment, variant: string): Promise<void> {
  await callApp("force-variant", { name: experimentName(experiment), variant });
}
