import {
  type EvaluationContext,
  FlagNotFoundError,
  type Provider,
  TypeMismatchError,
} from "@openfeature/server-sdk";
import { experiment } from "./experiment";
import { type FlagSubject, flag } from "./flag";
import { flagDefinitions } from "./registry";

function definitionNamed(key: string) {
  const definition = flagDefinitions().find((candidate) => candidate.name === key);

  if (!definition) throw new FlagNotFoundError(`No flag or experiment is named "${key}"`);

  return definition;
}

function subjectOf(context: EvaluationContext): FlagSubject | undefined {
  if (!context.targetingKey) return undefined;

  return { id: context.targetingKey, role: typeof context.role === "string" ? context.role : undefined };
}

function unsupported(kind: string): never {
  throw new TypeMismatchError(`nuxvel flags are booleans and experiments are strings, not ${kind}`);
}

/**
 * An OpenFeature server provider backed by nuxvel's flags and
 * experiments.
 *
 * Auto-imported on the server. Register it once, in a server plugin, and
 * read flags through an OpenFeature client. A flag resolves as a
 * boolean through {@link flag}, an experiment as the name of its variant
 * through {@link experiment}, so targeting, exposures and the consent
 * rule apply as usual. The context's `targetingKey` is the user ID and a
 * string `role` attribute is the role. Without a `targetingKey`, the
 * signed-in user is the subject. An unknown name resolves to the default
 * with `FLAG_NOT_FOUND`; a number or object lookup, or a flag read as a
 * string, resolves to the default with `TYPE_MISMATCH`.
 *
 * @example
 * ```ts
 * // server/plugins/openfeature.ts
 * import { OpenFeature } from "@openfeature/server-sdk";
 *
 * export default defineNitroPlugin(() => {
 *   OpenFeature.setProvider(nuxvelFlagProvider());
 * });
 *
 * // anywhere on the server
 * const on = await OpenFeature.getClient().getBooleanValue("new-editor", false, { targetingKey: user.id });
 * ```
 */
export function nuxvelFlagProvider(): Provider {
  return {
    metadata: { name: "nuxvel" },
    runsOn: "server",
    async resolveBooleanEvaluation(key, _defaultValue, context) {
      const definition = definitionNamed(key);

      if (definition.kind !== "flag") unsupported("an experiment read as a boolean");

      return { value: await flag(definition.name, subjectOf(context)) };
    },
    async resolveStringEvaluation(key, _defaultValue, context) {
      const definition = definitionNamed(key);

      if (definition.kind !== "experiment") unsupported("a flag read as a string");

      const variant = await experiment(definition.name, subjectOf(context));

      return { value: variant, variant };
    },
    resolveNumberEvaluation: () => unsupported("numbers"),
    resolveObjectEvaluation: () => unsupported("objects"),
  };
}
