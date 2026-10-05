import { onMounted, onUnmounted } from "vue";
import { type ChannelListener, subscribeToChannel } from "./channel-connection";

export function useChannelSubscription(channel: string, listener: ChannelListener, resync?: () => void) {
  let unsubscribe: (() => void) | undefined;

  function stop() {
    unsubscribe?.();
    unsubscribe = undefined;
  }

  onMounted(() => {
    unsubscribe = subscribeToChannel(channel, listener, resync);
  });

  onUnmounted(stop);

  return stop;
}
