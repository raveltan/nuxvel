import { type ComputedRef, type ShallowRef, computed, onUnmounted, shallowRef } from "vue";
import type { PresenceMember } from "../../server/realtime/presence";
import type { Channel } from "../../server/realtime/define-channel";
import type { DefinitionPresence, PresenceChannelName, PresenceState, PresenceStateOf } from "../../server/realtime/registry";
import { type PresenceParams, presenceRoom } from "../../shared/realtime/presence-room";
import { currentConnectionId } from "../realtime/channel-connection";
import { useChannelSubscription } from "../realtime/channel-subscription";

const STATE_DEBOUNCE_MS = 300;

type PresenceChange = { userId: string; member?: PresenceMember; members?: PresenceMember[] };

const roomMembers = new Map<string, ShallowRef<readonly PresenceMember[]>>();

function sharedMembers(room: string) {
  const members = roomMembers.get(room) ?? shallowRef<readonly PresenceMember[]>([]);

  roomMembers.set(room, members);

  return members;
}

function applyPresence(current: readonly PresenceMember[], event: string, { userId, member, members }: PresenceChange) {
  if (event === "presence.sync") return members ?? [];
  if (!member) return current.filter((existing) => existing.userId !== userId);

  return current.some((existing) => existing.userId === userId)
    ? current.map((existing) => (existing.userId === userId ? member : existing))
    : [...current, member];
}

/** What {@link usePresence} returns for the channel `Name`. */
export type PresenceRoom<Name extends PresenceChannelName> = PresenceRoomOf<PresenceState<Name>>;

/** What {@link usePresence} returns for a channel whose members share `State`; see {@link PresenceRoom}. */
export interface PresenceRoomOf<State> {
  members: ComputedRef<readonly PresenceMember<State>[]>;
  isPresent: (userId: string) => boolean;
  setState: (partial: State) => void;
}

/**
 * Joins one room of a presence channel from a component, and returns
 * who is in it with a way to share this user's state. The channel is
 * its name or its entry in the auto-imported `$channels` namespace
 * (`$channels.posts`), which in the app holds only the name.
 *
 * Auto-imported. It joins over the tab's single realtime connection,
 * the one `useChannel()` uses, when the component mounts, and leaves on
 * unmount. It does nothing during SSR. `members` holds one
 * {@link PresenceMember} per user, this user included. It starts from the
 * list that the server sends when the tab joins the room
 * (`presence.sync`), and changes on each `presence.join`,
 * `presence.update` and `presence.leave`. Every `usePresence()` of the
 * same room in a tab shares one list.
 * `setState(partial)` merges into this user's state. Calls within
 * 300 ms are merged into one request, so it is safe to call on every
 * key press. The channel's `presence.state` schema validates it on the
 * server. Only a signed-in user becomes a member.
 *
 * @param name A channel whose `defineChannel()` sets `presence`, a
 * {@link PresenceChannelName}, or its `$channels` entry.
 * @param options.params What selects the room, such as `{ id: post.id }`,
 * as in `useChannel(name, { params })`. Leave it out for the room
 * without params.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { members, setState } = usePresence($channels.posts, { params: { id: 42 } });
 * </script>
 *
 * <template>
 *   <PresenceAvatars :members="members" />
 *   <UInput @input="setState({ typing: true })" @blur="setState({ typing: false })" />
 * </template>
 * ```
 */
export function usePresence<Name extends PresenceChannelName>(name: Name, options?: { params?: PresenceParams }): PresenceRoom<Name>;
export function usePresence<Definition extends Channel>(
  channel: [DefinitionPresence<Definition>] extends [never] ? never : Definition,
  options?: { params?: PresenceParams },
): PresenceRoomOf<PresenceStateOf<DefinitionPresence<Definition>>>;
export function usePresence(
  channel: string | Channel,
  { params = {} }: { params?: PresenceParams } = {},
): PresenceRoomOf<Record<string, unknown>> | PresenceRoomOf<never> {
  const room = presenceRoom(typeof channel === "string" ? channel : channel.name, params);
  type Member = PresenceMember<Record<string, unknown>>;

  const members = import.meta.client ? sharedMembers(room) : shallowRef<readonly Member[]>([]);
  let pending: Record<string, unknown> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function send() {
    const connectionId = currentConnectionId();

    if (connectionId === undefined) {
      timer = setTimeout(send, STATE_DEBOUNCE_MS);
      return;
    }

    const state = pending;

    timer = undefined;
    pending = undefined;
    await fetch("/api/channels/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId, channel: room, state }),
    });
  }

  function setState(partial: Record<string, unknown>) {
    pending = { ...pending, ...partial };
    clearTimeout(timer);
    timer = setTimeout(send, STATE_DEBOUNCE_MS);
  }

  function isPresent(userId: string) {
    return members.value.some((member) => member.userId === userId);
  }

  useChannelSubscription(room, ({ event, payload }) => {
    if (!event.startsWith("presence.")) return;
    // the server sends presence.sync as { members } and each other presence event as { userId, member? }, each state validated by the channel's schema
    members.value = applyPresence(members.value, event, payload as PresenceChange);
  });

  onUnmounted(() => {
    clearTimeout(timer);
  });

  return { members: computed(() => members.value), isPresent, setState };
}
