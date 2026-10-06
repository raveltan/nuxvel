import { defineNuxtPlugin } from "#app";
import { useToast } from "#imports";
import { useConfirm } from "./use-confirm";

/** Gives the `toast` and `confirm` options of `$api` mutations the Nuxt UI toasts and dialog. */
export default defineNuxtPlugin({
  name: "nuxvel:mutation-ui",
  setup(nuxtApp) {
    nuxtApp.provide("nuxvelMutationUi", { toast: useToast().add, confirm: useConfirm() });
  },
});
