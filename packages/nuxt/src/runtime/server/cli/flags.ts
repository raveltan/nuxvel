import { writeFile } from "node:fs/promises";
import type { Flag } from "../flags/define-flag";
import { type ExperimentReport, experimentReport } from "../flags/experiment-report";
import { experimentState, startExperiment, stopExperiment } from "../flags/experiment-state";
import { type ExperimentName, type FlagName, flagDefinitions } from "../flags/registry";
import { type StoredFlagTargeting, flagTargeting, setFlagTargeting } from "../flags/targeting";
import type { NuxvelCommand } from "./command";
import { CommandError, commandSuccess } from "./command-error";
import type { FlagsListing, StaleFlagsListing } from "./flags-listing";

type FlagsCommand = Extract<
  NuxvelCommand,
  { kind: "flags:list" | "flags:stale" | "flags:set" | "experiment:start" | "experiment:stop" | "experiment:report" }
>;

const STALE_ROLLOUT_MS = 30 * 24 * 60 * 60 * 1000;

function flagNamed(name: string): FlagName {
  const found = flagDefinitions().find((definition) => definition.kind === "flag" && definition.name === name);

  if (found?.kind !== "flag") {
    throw new CommandError(`no flag named "${name}"`, { hint: "Run nuxvel flags:list to see the flags" });
  }

  return found.name;
}

function experimentNamed(name: string): ExperimentName {
  const found = flagDefinitions().find((definition) => definition.kind === "experiment" && definition.name === name);

  if (found?.kind !== "experiment") {
    throw new CommandError(`no experiment named "${name}"`, { hint: "Run nuxvel flags:list to see the experiments" });
  }

  return found.name;
}

function describeTargeting(targeting: StoredFlagTargeting) {
  const parts = [
    targeting.percentage === undefined ? undefined : `${targeting.percentage}%`,
    ...Object.entries(targeting.roles ?? {}).map(([role, value]) => `role ${role}=${value}`),
  ].filter((part) => part !== undefined);

  return parts.length === 0 ? "untargeted" : parts.join(", ");
}

function staleness(definition: Flag, targeting: StoredFlagTargeting, now: Date) {
  if (definition.expiresAt && new Date(definition.expiresAt) < now) {
    return { reason: "expired" as const, since: definition.expiresAt };
  }

  if (
    targeting.percentage !== undefined &&
    targeting.percentage >= 100 &&
    targeting.updatedAt &&
    now.getTime() - new Date(targeting.updatedAt).getTime() > STALE_ROLLOUT_MS
  ) {
    return { reason: "fully rolled out" as const, since: targeting.updatedAt };
  }

  return undefined;
}

async function list(outFile: string) {
  const listing: FlagsListing = { flags: [], experiments: [] };

  for (const definition of flagDefinitions()) {
    if (definition.kind === "experiment") {
      const state = await experimentState(definition.name);

      listing.experiments.push({
        name: definition.name,
        variants: state?.variants ?? definition.variants,
        status: state === undefined ? "not started" : state.running ? "running" : "stopped",
      });
      continue;
    }

    const targeting = await flagTargeting(definition.name);

    listing.flags.push({
      name: definition.name,
      default: definition.default,
      percentage: targeting.percentage ?? null,
      roles: targeting.roles ?? {},
      targeting: describeTargeting(targeting),
      updatedAt: targeting.updatedAt ?? null,
      expiresAt: definition.expiresAt ?? null,
    });
  }

  await writeFile(outFile, JSON.stringify(listing));
}

async function stale(now: Date, outFile: string) {
  const listing: StaleFlagsListing = { flags: [], names: [] };

  for (const definition of flagDefinitions()) {
    if (definition.kind !== "flag") continue;

    listing.names.push(definition.name);

    const found = staleness(definition, await flagTargeting(definition.name), now);

    if (found) listing.flags.push({ name: definition.name, ...found });
  }

  await writeFile(outFile, JSON.stringify(listing));
}

async function set(command: Extract<FlagsCommand, { kind: "flags:set" }>) {
  const name = flagNamed(command.name);
  const { updatedAt: _, ...targeting } = await flagTargeting(name);

  if (command.percentage !== undefined) targeting.percentage = command.percentage;

  if (command.role !== undefined) {
    targeting.roles = { ...targeting.roles, [command.role]: command.value ?? true };
  } else if (command.value !== undefined) {
    targeting.percentage = command.value ? 100 : 0;
  }

  await setFlagTargeting(name, targeting);
  commandSuccess(`${name}  ${describeTargeting(targeting)}`);
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatExperimentReport(report: ExperimentReport) {
  const pValue = report.sampleRatio.pValue.toPrecision(3);
  const lines = [
    report.sampleRatio.mismatch
      ? `${report.name}  SAMPLE RATIO MISMATCH (p=${pValue}): results are not trustworthy`
      : `${report.name}  sample ratio ok (p=${pValue})`,
  ];

  for (const variant of report.variants) {
    const metrics = variant.metrics.map(
      (result) =>
        `${result.metric} ${result.conversions} (${percent(result.rate)}, 95% CI ${percent(result.low)}–${percent(result.high)})`,
    );

    lines.push(
      [`${variant.variant}  weight ${variant.weight}  exposures ${variant.exposures}`, ...metrics].join("  "),
    );
  }

  return lines.join("\n");
}

export async function runFlagsCommand(command: FlagsCommand): Promise<number> {
  switch (command.kind) {
    case "flags:list":
      await list(command.outFile);
      break;
    case "flags:stale":
      await stale(new Date(command.now), command.outFile);
      break;
    case "flags:set":
      await set(command);
      break;
    case "experiment:start":
      await startExperiment(experimentNamed(command.name));
      commandSuccess(`${command.name}  running`);
      break;
    case "experiment:stop":
      await stopExperiment(experimentNamed(command.name));
      commandSuccess(`${command.name}  stopped`);
      break;
    case "experiment:report": {
      const report = await experimentReport(experimentNamed(command.name));

      if (command.outFile) await writeFile(command.outFile, JSON.stringify(report));
      else console.log(formatExperimentReport(report));
      break;
    }
  }

  return 0;
}
