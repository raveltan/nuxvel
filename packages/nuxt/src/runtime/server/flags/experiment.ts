import { publishObserved } from "../observe/channels";
import { evaluateExperiment } from "./evaluation/evaluate-experiment";
import { recordExposure } from "./evaluation/record-exposure";
import { experimentState } from "./experiment-state";
import { experimentSubject, resolveSubject } from "./evaluation/subject";
import type { Experiment } from "./define-experiment";
import type { FlagSubject } from "./flag";
import {
  findExperiment,
  flagStoredName,
  type ExperimentName,
  type ExperimentVariant,
} from "./registry";

/**
 * The variant of an experiment the current user is in. The experiment is
 * its name or its definition (`$experiments.checkoutCta` or an import).
 *
 * Auto-imported on the server. Until {@link startExperiment} runs it,
 * and after {@link stopExperiment}, everyone gets the first variant,
 * the control. While it runs, assignment is deterministic, weighted by
 * the variants locked at start: the same user always gets the same
 * variant, with nothing stored. With no user it is the control.
 *
 * The user is resolved as in {@link flag}: the running action's
 * `"user"` actor, else the signed-in one from `auth()`. Pass `subject`
 * to evaluate for someone else, or outside both. Throws
 * when no experiment has this name.
 *
 * With `nuxvel.experiments.requireConsent`, a request without the
 * `nuxvel-consent=granted` cookie gets the control and records nothing.
 *
 * While it runs, each call records an exposure in `flag_exposures`,
 * like {@link flag}: one row per user per variant, and none with no
 * user. A stopped experiment records nothing.
 *
 * @param subject Evaluate for this user instead of the signed-in one.
 *
 * @example
 * ```ts
 * const cta = await experiment("checkout-cta");
 * const sameCta = await experiment($experiments.checkoutCta);
 * ```
 */
export async function experiment<Name extends ExperimentName>(
  name: Name,
  subject?: FlagSubject,
): Promise<ExperimentVariant<Name>>;
export async function experiment<Variant extends string>(
  experiment: Experiment<string, Variant>,
  subject?: FlagSubject,
): Promise<Variant>;
export async function experiment(nameOrExperiment: string | Experiment, subject?: FlagSubject): Promise<string> {
  const name = typeof nameOrExperiment === "string" ? nameOrExperiment : nameOrExperiment.name;
  const resolved = experimentSubject(await resolveSubject(subject));

  const definition = findExperiment(name);
  const { variant, enrolled } = evaluateExperiment(
    definition,
    await experimentState(definition),
    resolved,
  );

  if (enrolled) await recordExposure(flagStoredName(definition), resolved, variant);
  publishObserved("flag:evaluation", { kind: "experiment", name, value: variant });

  return variant;
}
