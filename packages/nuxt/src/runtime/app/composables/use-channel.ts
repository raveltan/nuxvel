import { type ComputedRef, computed, onMounted, onUnmounted, shallowRef } from "vue";
import type { Channel, ChannelEvents, ChannelPresence } from "../../server/realtime/define-channel";
import type {
  ChannelMessage,
  ChannelName,
  ChannelParams,
  EventsMessage,
  RoomParams,
} from "../../server/realtime/registry";
import { type PresenceParams, presenceRoom } from "../../shared/realtime/presence-room";
import { type ChannelStatus, connectionStatus } from "../realtime/channel-connection";
import { useChannelSubscription } from "../realtime/channel-subscription";

type Listening<Message> = {
  events: ComputedRef<readonly Message[]>;
  status: ComputedRef<ChannelStatus>;
  close: () => void;
};

/**
 * Listens to a realtime channel from a component and collects what it
 * receives. The channel is its name or its entry in the auto-imported
 * `$channels` namespace (`$channels.posts`), which in the app holds only
 * the name; go-to-definition on the key opens the channel's file.
 *
 * Auto-imported. Once the component mounts it joins the channel over the
 * tab's single `EventSource` on `/api/channels`, shared with every other
 * `useChannel()` on the page, and leaves it again when the component
 * unmounts; it does nothing during SSR. Each `broadcast()` to the
 * channel is appended to `events` as a {@link ChannelMessage}, oldest
 * first — typed by the channel's `events`, so narrowing on `event`
 * types `payload` as that event schema's output. Only the newest
 * `limit` messages are kept, so a long-lived page does not grow
 * without bound. `close()` stops listening early. When the connection drops it
 * is reopened with every joined channel after a random delay, which grows
 * on each failure up to 30 seconds, and the server replays what was
 * missed, so `events` has no duplicate, and no gap unless more than
 * the channel's last 500 events were missed. The connection sends the
 * app's build ID: after a deploy, the server answers a tab of the older
 * build with a `reload` event, and the page reloads, so it never reads
 * payloads of a newer shape.
 * The server decides who may listen with the channel's `authorize`; see
 * `defineChannel()`. A channel it refuses, or one no file defines, is
 * dropped rather than retried: `events` simply stays empty until the
 * connection is reopened. `status` is the shared connection's
 * {@link ChannelStatus}, `closed` before mount and after `close()`.
 * With `params`, it listens to that room of the channel only, and gets
 * the `broadcast()` calls with the same `params`. On a presence channel,
 * that is the room `usePresence()` joins, so a signed-in user becomes a
 * member; the presence events do not reach `events`.
 *
 * @param name The channel's `name`, a {@link ChannelName}, or its `$channels` entry.
 * @param options.params The room to listen to, such as `{ boardId: 7 }`.
 * The channel's `defineChannel()` names the params, so a wrong param
 * fails to compile. Leave it out to listen to the channel itself.
 * @param options.limit How many of the newest messages `events` keeps;
 * older ones are dropped. Defaults to 100.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { events } = useChannel("announcements");
 * const posts = useChannel($channels.posts);
 * const board = useChannel("board", { params: { boardId: 7 } });
 * </script>
 *
 * <template>
 *   <p v-for="(message, index) in events" :key="index">{{ message.payload.title }}</p>
 * </template>
 * ```
 */
export function useChannel<Name extends ChannelName>(
  name: Name,
  options?: { params?: ChannelParams<Name>; limit?: number },
): Listening<ChannelMessage<Name>>;
export function useChannel<Events extends ChannelEvents, Params extends string = never>(
  channel: Channel<string, Events, ChannelPresence | undefined, Params>,
  options?: { params?: RoomParams<Params>; limit?: number },
): Listening<EventsMessage<Events>>;
export function useChannel(
  channel: string | Channel,
  { params, limit = 100 }: { params?: PresenceParams; limit?: number } = {},
): Listening<unknown> {
  const channelName = typeof channel === "string" ? channel : channel.name;
  const name = params === undefined ? channelName : presenceRoom(channelName, params);
  const events = shallowRef<readonly unknown[]>([]);
  const listening = shallowRef(false);
  const unsubscribe = useChannelSubscription(name, (message) => {
    if (message.event.startsWith("presence.")) return;
    events.value = [...events.value, message].slice(-limit);
  });

  function close() {
    unsubscribe();
    listening.value = false;
  }

  onMounted(() => {
    listening.value = true;
  });

  onUnmounted(close);

  return {
    events: computed(() => events.value),
    status: computed<ChannelStatus>(() => (listening.value ? connectionStatus.value : "closed")),
    close,
  };
}
