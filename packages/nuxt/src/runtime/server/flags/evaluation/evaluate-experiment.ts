import type { Experiment } from "../define-experiment";
import type { FlagSubject } from "../flag";
import type { ExperimentState } from "../experiment-state";
import { flagStoredName } from "../registry";
import { bucketOf } from "./bucket";

export function evaluateExperiment(
  definition: Experiment,
  state: ExperimentState | undefined,
  subject: FlagSubject | undefined,
) {
  const [control] = Object.keys(definition.variants);

  if (!control) {
    throw new Error(`nuxvel: experiment "${definition.name}" has no variants`);
  }
  if (!state?.running || !subject) return { variant: control, enrolled: false };

  const variants = Object.entries(state.variants);
  const total = variants.reduce((sum, [, weight]) => sum + weight, 0);
  const point = (bucketOf(flagStoredName(definition), subject.id) / 100) * total;
  let reached = 0;

  for (const [variant, weight] of variants) {
    reached += weight;
    if (point < reached) return { variant, enrolled: true };
  }

  return { variant: control, enrolled: true };
}
