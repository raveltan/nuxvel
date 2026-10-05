import { onMounted } from "vue";
import { useState } from "#app";
import {
  FLAGS_CHANNEL,
  type FlagValues,
} from "../../shared/flags/flag-values";
import { useChannelSubscription } from "../realtime/channel-subscription";

let refreshing: Promise<void> | undefined;
let revalidated: Promise<void> = Promise.resolve();

export function useFlagValues() {
  return useState<FlagValues | undefined>("nuxvel:flags", () => undefined);
}

function refresh(state: ReturnType<typeof useFlagValues>) {
  refreshing ??= $fetch<FlagValues>("/api/flags")
    .then((values) => {
      state.value = values;
    })
    .finally(() => {
      refreshing = undefined;
    });

  return refreshing;
}

export function revalidateFlagValues(
  state: ReturnType<typeof useFlagValues>,
) {
  revalidated = refresh(state).catch(() => undefined);
}

async function recordExposure(name: string) {
  await revalidated;
  await $fetch("/api/flags/exposures", { method: "POST", body: { name } });
}

export function useLiveFlagValues(name: string) {
  const state = useFlagValues();

  onMounted(() => {
    void recordExposure(name).catch(() => undefined);
  });

  useChannelSubscription(FLAGS_CHANNEL, () => {
    void refresh(state).catch(() => undefined);
  });

  return state;
}
