import { and, count, eq } from "drizzle-orm";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { sampleRatioPValue, wilsonInterval } from "./evaluation/statistics";
import { experimentState } from "./experiment-state";
import { type ExperimentName, findExperiment, flagStoredName } from "./registry";

/** One metric's conversions within one variant of an {@link ExperimentReport}. */
export interface MetricResult {
  metric: string;
  conversions: number;
  /** `conversions / exposures`, from 0 to 1. */
  rate: number;
  /** 95% Wilson confidence interval around `rate`. */
  low: number;
  high: number;
}

/** What {@link experimentReport} returns: each variant's exposures and conversion rates, and the sample-ratio check. */
export interface ExperimentReport {
  name: string;
  variants: {
    variant: string;
    weight: number;
    exposures: number;
    metrics: MetricResult[];
  }[];
  /**
   * Chi-square test of the exposures against the weights. A `pValue`
   * under 0.001 sets `mismatch`: users are not landing in variants in
   * the proportions configured, so the results can't be trusted.
   */
  sampleRatio: { pValue: number; mismatch: boolean };
}

const SAMPLE_RATIO_THRESHOLD = 0.001;

async function countsBy<Key extends string>(
  rows: Promise<({ count: number } & Record<Key, string>)[]>,
  key: Key,
) {
  return new Map((await rows).map((row) => [row[key], row.count]));
}

/**
 * The results so far of an experiment: exposures per variant, and for
 * each of its `metrics` the conversions, conversion rate and 95%
 * confidence interval, plus a sample-ratio mismatch check.
 *
 * Auto-imported on the server; `nuxvel experiment:report` prints it.
 * Weights are the ones locked when the experiment started, or the
 * code's when it never has. `name` is an {@link ExperimentName}; an
 * unknown name also throws at runtime.
 *
 * @example
 * ```ts
 * const { variants, sampleRatio } = await experimentReport("checkout-cta");
 * ```
 */
export async function experimentReport(name: ExperimentName): Promise<ExperimentReport> {
  const definition = findExperiment(name);
  const weights =
    (await experimentState(name))?.variants ?? definition.variants;
  const stored = flagStoredName(definition);
  const db = useDb({ root: true });
  const flagExposures = schemaTable("flag_exposures");
  const flagConversions = schemaTable("flag_conversions");

  const exposures = await countsBy(
    db
      .select({ variant: flagExposures.variant, count: count() })
      .from(flagExposures)
      .where(eq(flagExposures.name, stored))
      .groupBy(flagExposures.variant),
    "variant",
  );

  const variants = await Promise.all(
    Object.entries(weights).map(async ([variant, weight]) => {
      const exposed = exposures.get(variant) ?? 0;
      const conversions = await countsBy(
        db
          .select({ metric: flagConversions.metric, count: count() })
          .from(flagConversions)
          .innerJoin(
            flagExposures,
            and(
              eq(flagExposures.name, flagConversions.name),
              eq(flagExposures.unitId, flagConversions.unitId),
            ),
          )
          .where(
            and(eq(flagConversions.name, stored), eq(flagExposures.variant, variant)),
          )
          .groupBy(flagConversions.metric),
        "metric",
      );

      return {
        variant,
        weight,
        exposures: exposed,
        metrics: (definition.metrics ?? []).map((metric) => {
          const converted = conversions.get(metric) ?? 0;

          return {
            metric,
            conversions: converted,
            rate: exposed === 0 ? 0 : converted / exposed,
            ...wilsonInterval(converted, exposed),
          };
        }),
      };
    }),
  );

  const pValue = sampleRatioPValue(
    variants.map((variant) => variant.exposures),
    variants.map((variant) => variant.weight),
  );

  return {
    name,
    variants,
    sampleRatio: { pValue, mismatch: pValue < SAMPLE_RATIO_THRESHOLD },
  };
}
