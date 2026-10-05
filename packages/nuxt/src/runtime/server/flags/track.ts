import { and, eq } from "drizzle-orm";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { resolveSubject } from "./evaluation/subject";
import type { FlagSubject } from "./flag";
import { flagDefinitions, flagStoredName, type ExperimentMetric } from "./registry";

/**
 * Records that the current user converted on a metric, for every
 * experiment that lists it in `metrics` and has shown them a variant.
 *
 * Auto-imported on the server. A conversion only counts for an
 * experiment the user has an exposure in, and once per user per metric,
 * however often it is tracked; `nuxvel experiment:report` turns these
 * into conversion rates per variant. The user is resolved as in
 * {@link flag}. Nothing is recorded with no user.
 * Written outside any ambient transaction, like exposures.
 *
 * @param subject Record for this user instead of the signed-in one.
 *
 * @example
 * ```ts
 * await track("checkout.completed");
 * ```
 */
export async function track(
  metric: ExperimentMetric,
  subject?: FlagSubject,
): Promise<void> {
  const resolved = await resolveSubject(subject);

  if (!resolved) return;

  const flagExposures = schemaTable("flag_exposures");
  const flagConversions = schemaTable("flag_conversions");

  for (const definition of flagDefinitions()) {
    if (definition.kind !== "experiment") continue;
    if (!definition.metrics?.includes(metric)) continue;

    const [exposure] = await useDb({ root: true })
      .select({ variant: flagExposures.variant })
      .from(flagExposures)
      .where(
        and(
          eq(flagExposures.name, flagStoredName(definition)),
          eq(flagExposures.unitId, resolved.id),
        ),
      )
      .limit(1);

    if (!exposure) continue;

    await useDb({ root: true })
      .insert(flagConversions)
      .values({ name: flagStoredName(definition), unitId: resolved.id, metric })
      .onConflictDoNothing();
  }
}
