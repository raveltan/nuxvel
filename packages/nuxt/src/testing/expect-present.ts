import { expect } from "vitest";
import type { PresenceMember } from "../runtime/server/realtime/presence";
import type { Channel } from "../runtime/server/realtime/define-channel";
import type {
  DefinitionPresence,
  PresenceChannelName,
  PresenceState,
  PresenceStateOf,
} from "../runtime/server/realtime/registry";
import type { PresenceParams } from "../runtime/shared/realtime/presence-room";
import { callApp } from "./settled";

/**
 * Asserts that the `user` is a member of one room of a presence
 * channel in the app under test, and returns that member.
 *
 * It reads what the server's `presenceOf(channel, params)` returns, so
 * a member whose connection missed two heartbeats does not count.
 *
 * @param channel A channel whose `defineChannel()` sets `presence`: its
 * name, or its definition or its stub from `#nuxvel/test-namespaces`.
 * @param params What selects the room, as in `usePresence()`.
 *
 * @example
 * ```ts
 * const member = await expectPresent("posts", { id: post.id }, user);
 * expect(member.state).toEqual({ typing: true });
 * await expectPresent($channels.posts, { id: post.id }, user);
 * ```
 */
export async function expectPresent<Name extends PresenceChannelName>(
  channel: Name,
  params: PresenceParams,
  user: { id: string },
): Promise<PresenceMember<PresenceState<Name>>>;
export async function expectPresent<Definition extends Channel>(
  channel: [DefinitionPresence<Definition>] extends [never] ? never : Definition,
  params: PresenceParams,
  user: { id: string },
): Promise<PresenceMember<PresenceStateOf<DefinitionPresence<Definition>>>>;
export async function expectPresent(
  nameOrChannel: string | Channel,
  params: PresenceParams,
  user: { id: string },
): Promise<PresenceMember> {
  const channel = typeof nameOrChannel === "string" ? nameOrChannel : nameOrChannel.name;
  const members = await callApp<PresenceMember[]>("presence", { channel, params });
  const member = members.find((candidate) => candidate.userId === user.id);

  expect(member, `${user.id} is not present in ${channel} ${JSON.stringify(params)}`).toBeDefined();

  if (!member) throw new Error("expectPresent: no such member");

  return member;
}

/**
 * Asserts that the `user` is not a member of one room of a
 * presence channel in the app under test. The opposite of
 * {@link expectPresent}, with the same arguments.
 *
 * @example
 * ```ts
 * await expectNotPresent("posts", { id: post.id }, user);
 * ```
 */
export async function expectNotPresent<Name extends PresenceChannelName>(
  channel: Name,
  params: PresenceParams,
  user: { id: string },
): Promise<void>;
export async function expectNotPresent<Definition extends Channel>(
  channel: [DefinitionPresence<Definition>] extends [never] ? never : Definition,
  params: PresenceParams,
  user: { id: string },
): Promise<void>;
export async function expectNotPresent(nameOrChannel: string | Channel, params: PresenceParams, user: { id: string }) {
  const channel = typeof nameOrChannel === "string" ? nameOrChannel : nameOrChannel.name;
  const members = await callApp<PresenceMember[]>("presence", { channel, params });

  expect(
    members.some((member) => member.userId === user.id),
    `${user.id} is present in ${channel} ${JSON.stringify(params)}`,
  ).toBe(false);
}
