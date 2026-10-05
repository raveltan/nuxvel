import { awaitingName } from "../discovery/definition-name";

/**
 * An experiment definition: its name, the relative weight of each
 * variant, and the metrics it converts on. The name is its file's path
 * under `server/flags/`.
 */
export interface Experiment<
  Name extends string = string,
  Variant extends string = string,
  Metric extends string = string,
> {
  kind: "experiment";
  readonly name: Name;
  variants: Record<Variant, number>;
  metrics?: readonly Metric[];
}

/**
 * Defines an experiment: an A/B test splitting users between named
 * variants by weight.
 *
 * `defineExperiment` is auto-imported. One flag or experiment per file,
 * under `server/flags/`; the file is discovered, so nothing registers it,
 * and its path is the experiment's name (`server/flags/checkout-cta.experiment.ts`
 * is `"checkout-cta"`), the salt of its buckets; {@link renamed} at the
 * old path keeps a moved one's state and buckets. Read a user's variant
 * with {@link experiment}.
 *
 * Assignment is deterministic: the same user always lands in the same
 * variant, with nothing stored.
 *
 * @param config.variants Each variant's weight. Weights are relative, so
 * `{ control: 50, green: 50 }` and `{ control: 1, green: 1 }` split alike.
 * The first variant is the control.
 * @param config.metrics The {@link track} metrics that count as a
 * conversion for this experiment in `nuxvel experiment:report`.
 *
 * @example
 * ```ts
 * // server/flags/checkout-cta.experiment.ts
 * export const checkoutCtaExperiment = defineExperiment({
 *   variants: { control: 50, green: 50 },
 *   metrics: ["checkout.completed"],
 * });
 * ```
 */
export function defineExperiment<
  const Variant extends string,
  const Metric extends string = never,
>(config: {
  variants: Record<Variant, number>;
  metrics?: readonly Metric[];
}): Experiment<string, Variant, Metric> {
  const definition: Experiment<string, Variant, Metric> = { kind: "experiment", name: "", ...config };

  return awaitingName(definition, "experiment");
}
