import { defineEventHandler, readValidatedBody } from "h3";
import { z } from "zod";
import { NotFoundError } from "../errors/taxonomy";
import { evaluateExperiment } from "../flags/evaluation/evaluate-experiment";
import { evaluateFlag } from "../flags/evaluation/evaluate-flag";
import { recordExposure } from "../flags/evaluation/record-exposure";
import { experimentSubject, resolveSubject } from "../flags/evaluation/subject";
import { experimentState } from "../flags/experiment-state";
import { flagDefinitions, flagStoredName } from "../flags/registry";
import { flagTargeting } from "../flags/targeting";

const exposureSchema = z.object({ name: z.string() });

export default defineEventHandler(async (event) => {
  const { name } = await readValidatedBody(event, exposureSchema.parse);
  const definition = flagDefinitions().find(
    (candidate) => candidate.name === name,
  );

  if (!definition) throw new NotFoundError(`No flag is named "${name}"`);

  const subject = await resolveSubject(undefined);
  const { variant, enrolled } =
    definition.kind === "flag"
      ? {
          variant: String(
            evaluateFlag(
              flagStoredName(definition),
              definition.default,
              await flagTargeting(definition.name),
              subject,
            ),
          ),
          enrolled: true,
        }
      : evaluateExperiment(definition, await experimentState(definition.name), experimentSubject(subject));

  if (enrolled) await recordExposure(flagStoredName(definition), subject, variant);

  return { recorded: true };
});
