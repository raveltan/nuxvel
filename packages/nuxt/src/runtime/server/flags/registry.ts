import flags from "#nuxvel/flags";
import { type Defined, definitionsIn, storedName } from "../discovery/aliases";
import type { Renamed } from "../discovery/renamed";
import type { Experiment } from "./define-experiment";
import type { Flag } from "./define-flag";

type Discovered = Defined<(typeof flags)[number]>;

/** The name of every flag defined under `server/flags/`. */
export type FlagName = Extract<Discovered, Flag>["name"];

/** The name of every experiment defined under `server/flags/`. */
export type ExperimentName = Extract<Discovered, Experiment>["name"];

/** Every metric an experiment under `server/flags/` lists in `metrics`. */
export type ExperimentMetric =
  Extract<Discovered, Experiment> extends Experiment<string, string, infer Metric>
    ? Metric
    : never;

/** The variants of the experiment named `Name`. */
export type ExperimentVariant<Name extends ExperimentName> =
  Extract<Discovered, Experiment<Name>> extends Experiment<Name, infer Variant>
    ? Variant
    : never;

/** A discovered flag or experiment, its name typed as a {@link FlagName} or {@link ExperimentName}. */
export type FlagDefinition = Flag<FlagName> | Experiment<ExperimentName>;

function entries(): readonly (FlagDefinition | Renamed)[] {
  return flags;
}

function definitions(): readonly FlagDefinition[] {
  return definitionsIn(entries());
}

/**
 * The name a flag or experiment is stored under — its targeting or
 * experiment state in Redis, its exposures and conversions, the salt of
 * its buckets: the old name a {@link renamed} alias keeps for it, or its
 * own.
 */
export function flagStoredName(definition: Flag | Experiment): string {
  return storedName(entries(), definition);
}

/**
 * Every flag and experiment defined under `server/flags/`.
 *
 * `GET /api/flags` evaluates each one.
 */
export function flagDefinitions(): readonly FlagDefinition[] {
  return definitions();
}

/**
 * The discovered flag with this name, throwing when no file under
 * `server/flags/` defines one.
 *
 * {@link flag} uses it.
 */
export function findFlag(name: string): Flag {
  const found = definitions().find(
    (definition): definition is Flag<FlagName> =>
      definition.kind === "flag" && definition.name === name,
  );

  if (!found) throw new Error(`nuxvel: no flag named "${name}"`);

  return found;
}

/**
 * The discovered experiment with this name, throwing when no file under
 * `server/flags/` defines one.
 *
 * {@link experiment} uses it.
 */
export function findExperiment(name: string): Experiment {
  const found = definitions().find(
    (definition): definition is Experiment<ExperimentName> =>
      definition.kind === "experiment" && definition.name === name,
  );

  if (!found) throw new Error(`nuxvel: no experiment named "${name}"`);

  return found;
}
