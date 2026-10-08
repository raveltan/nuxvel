import { computed, type ComputedRef } from "vue";
import type { Experiment } from "../../server/flags/define-experiment";
import type {
  ExperimentName,
  ExperimentVariant,
} from "../../server/flags/registry";
import { useLiveFlagValues } from "../flags/flag-values";

/**
 * The variant of an experiment the current user is in, as a live ref.
 * The experiment is its name, typed from the experiments that
 * `server/flags/` defines.
 *
 * Import it from `@nuxvel/nuxt/app/flags`. Assigned on the server and carried in the SSR payload,
 * like {@link useFlag}, and refreshed the same way over the `flags`
 * channel, and records an exposure on mount the same way. It is
 * `undefined` only if the values could not be loaded at all.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useExperiment } from "@nuxvel/nuxt/app/flags";
 *
 * const cta = useExperiment("checkout-cta");
 * </script>
 *
 * <template>
 *   <button :class="{ green: cta === 'green' }">Checkout</button>
 * </template>
 * ```
 */
export function useExperiment<Name extends ExperimentName>(
  name: Name,
): ComputedRef<ExperimentVariant<Name> | undefined>;
export function useExperiment<Variant extends string>(
  experiment: Experiment<string, Variant>,
): ComputedRef<Variant | undefined>;
export function useExperiment(experiment: string | Experiment): ComputedRef<string | undefined> {
  const name = typeof experiment === "string" ? experiment : experiment.name;
  const values = useLiveFlagValues(name);

  return computed(() => values.value?.experiments[name]);
}
