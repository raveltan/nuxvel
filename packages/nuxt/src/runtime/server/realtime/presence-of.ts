import { type PresenceParams, presenceRoom } from "../../shared/realtime/presence-room";
import { type PresenceMember, presenceMembers } from "./presence";
import type { Channel } from "./define-channel";
import type { DefinitionPresence, PresenceChannelName, PresenceState, PresenceStateOf } from "./registry";

/**
 * The users listening to one room of a presence channel right now, one
 * {@link PresenceMember} per user. The channel is its name or its
 * definition (`$channels.posts` or an import).
 *
 * Auto-imported on the server, and in `queue:work` jobs and `tinker`.
 * The channel's {@link defineChannel} sets `presence`, and `params`
 * picks the room, as `usePresence()` does in the browser. A user with
 * several tabs open is one member, and `connections` counts the tabs.
 * A member whose connection missed two heartbeats is not listed.
 *
 * @example
 * ```ts
 * const viewers = await presenceOf($channels.posts, { id: post.id });
 * const typing = viewers.filter((member) => member.state.typing);
 * ```
 */
export async function presenceOf<Name extends PresenceChannelName>(
  channel: Name,
  params?: PresenceParams,
): Promise<PresenceMember<PresenceState<Name>>[]>;
export async function presenceOf<Definition extends Channel>(
  channel: [DefinitionPresence<Definition>] extends [never] ? never : Definition,
  params?: PresenceParams,
): Promise<PresenceMember<PresenceStateOf<DefinitionPresence<Definition>>>[]>;
export async function presenceOf(channel: string | Channel, params: PresenceParams = {}): Promise<PresenceMember[]> {
  return presenceMembers(presenceRoom(typeof channel === "string" ? channel : channel.name, params));
}
