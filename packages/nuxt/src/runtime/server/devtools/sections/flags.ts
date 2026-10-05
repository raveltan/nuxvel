import { experimentStateKey, parseExperimentState } from "../../flags/experiment-state";
import { type FlagDefinition, flagDefinitions, flagStoredName } from "../../flags/registry";
import { flagTargetingKey, parseTargeting } from "../../flags/targeting";
import { useRedis } from "../../redis/client";
import { defineDevtoolsSection } from "../define-devtools-section";
import type { FlagsSectionData } from "../../../shared/devtools/sections/flags";

function stateKey(definition: FlagDefinition) {
  const stored = flagStoredName(definition);

  return definition.kind === "experiment" ? experimentStateKey(stored) : flagTargetingKey(stored);
}

function describe(definition: FlagDefinition, stored: string | null | undefined): FlagsSectionData[number] {
  const storedAs = flagStoredName(definition);
  const common = { name: definition.name, storedAs: storedAs === definition.name ? null : storedAs };

  if (definition.kind === "experiment") {
    const state = parseExperimentState(stored);

    return {
      ...common,
      kind: definition.kind,
      variants: state?.variants ?? definition.variants,
      status: state === undefined ? "not started" : state.running ? "running" : "stopped",
    };
  }

  return {
    ...common,
    kind: definition.kind,
    default: definition.default,
    expiresAt: definition.expiresAt ?? null,
    targeting: parseTargeting(stored),
  };
}

export default defineDevtoolsSection<FlagsSectionData>({
  id: "flags",
  title: "Flags and experiments",
  order: 70,
  load: async () => {
    const definitions = [...flagDefinitions()].sort((a, b) => String(a.name).localeCompare(b.name));

    if (definitions.length === 0) return [];

    const stored = await useRedis("durable").mget(definitions.map(stateKey));

    return definitions.map((definition, index) => describe(definition, stored[index]));
  },
});
