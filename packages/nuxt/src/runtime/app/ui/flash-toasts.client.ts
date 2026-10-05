import { defineNuxtPlugin } from "#app";
import { useToast } from "#imports";
import { watch } from "vue";
import { useFlash } from "../composables/use-flash";

/** Shows each {@link useFlash} message as a Nuxt UI toast, after hydration. */
export default defineNuxtPlugin({
  name: "nuxvel:flash-toasts",
  dependsOn: ["nuxvel:flash"],
  setup(nuxtApp) {
    const toast = useToast();
    const flashes = useFlash();
    const showFlashes = () => {
      watch(
        flashes,
        (current) => {
          for (const flash of current) toast.add({ title: flash.message, color: flash.type });
        },
        { immediate: true },
      );
    };

    if (nuxtApp.isHydrating) nuxtApp.hooks.hookOnce("app:suspense:resolve", showFlashes);
    else showFlashes();
  },
});
