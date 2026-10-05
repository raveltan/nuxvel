import { defineEventHandler } from "h3";
import type { FlagValues } from "../../shared/flags/flag-values";
import { evaluateExperiment } from "../flags/evaluation/evaluate-experiment";
import { evaluateFlag } from "../flags/evaluation/evaluate-flag";
import { experimentSubject, resolveSubject } from "../flags/evaluation/subject";
import { experimentStateKey, parseExperimentState } from "../flags/experiment-state";
import { type FlagDefinition, flagDefinitions, flagStoredName } from "../flags/registry";
import { flagTargetingKey, parseTargeting } from "../flags/targeting";
import { useLogger } from "../logging/logger";
import { useRedis } from "../redis/client";

function storedStateKey(definition: FlagDefinition) {
  return definition.kind === "experiment"
    ? experimentStateKey(flagStoredName(definition))
    : flagTargetingKey(flagStoredName(definition));
}

async function storedStates(definitions: readonly FlagDefinition[]): Promise<(string | null)[]> {
  if (definitions.length === 0) return [];

  try {
    return await useRedis("durable").mget(definitions.map(storedStateKey));
  } catch (error) {
    useLogger("flags").warn("stored flag state is unreachable, answering with the defaults", error);
    return definitions.map(() => null);
  }
}

export default defineEventHandler(async (): Promise<FlagValues> => {
  const definitions = flagDefinitions();
  const [subject, stored] = await Promise.all([resolveSubject(undefined), storedStates(definitions)]);
  const values: FlagValues = {
    subject: subject?.id ?? null,
    flags: {},
    experiments: {},
  };

  definitions.forEach((definition, index) => {
    if (definition.kind === "experiment") {
      values.experiments[definition.name] = evaluateExperiment(
        definition,
        parseExperimentState(stored[index]),
        experimentSubject(subject),
      ).variant;
    } else {
      values.flags[definition.name] = evaluateFlag(
        flagStoredName(definition),
        definition.default,
        parseTargeting(stored[index]),
        subject,
      );
    }
  });

  return values;
});
