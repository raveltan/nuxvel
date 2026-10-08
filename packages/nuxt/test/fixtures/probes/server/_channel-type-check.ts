import _probeBoardChannel from "#server/channels/_probe-board";
import _probePublicChannel from "#server/channels/_probe-public";
import { postsChannel } from "#server/channels/posts.channel";
import { defineChannel, presenceOf } from "@nuxvel/nuxt/server/realtime";
import type { Channel, ChannelName } from "@nuxvel/nuxt/server/realtime";

type IsAny<T> = 0 extends 1 & T ? true : false;

type ChannelConfig = Parameters<typeof defineChannel>[0];
type AuthorizeConnection = Parameters<NonNullable<ChannelConfig["authorize"]>>[0];

export const channelConfigIsTyped: IsAny<ChannelConfig> extends true
  ? never
  : true = true;
export const authorizeSeesUser: IsAny<AuthorizeConnection["user"]> extends true
  ? never
  : null extends AuthorizeConnection["user"]
    ? NonNullable<AuthorizeConnection["user"]>["id"] extends string
      ? true
      : never
    : never = true;
export const channelNameIsTyped: IsAny<ChannelName> extends true
  ? never
  : string extends ChannelName
    ? never
    : "posts" | "flags" extends ChannelName
      ? true
      : never = true;

export async function broadcastsToARoom() {
  await _probeBoardChannel.broadcast("moved", { card: 1 }, { boardId: 1 });
  await _probeBoardChannel.broadcast("moved", { card: 1 }, { boardId: "1" });
  await _probeBoardChannel.broadcast("moved", { card: 1 });

  // @ts-expect-error _probe-board names boardId, not board
  await _probeBoardChannel.broadcast("moved", { card: 1 }, { board: 1 });
  // @ts-expect-error a room needs every param
  await _probeBoardChannel.broadcast("moved", { card: 1 }, {});
  // @ts-expect-error _probe-public names no params
  await _probePublicChannel.broadcast("renamed", { id: 1 }, { id: 1 });
}

export async function presenceOfADefinition() {
  const [member] = await presenceOf(postsChannel, { id: 1 });
  const typing: boolean | undefined = member?.state.typing;

  // @ts-expect-error _probe-public sets no presence
  await presenceOf(_probePublicChannel);

  return typing;
}

type NamespacedChannel = typeof postsChannel;

export const channelsNamespaceIsTyped: IsAny<NamespacedChannel> extends true ? never : NamespacedChannel extends Channel ? true : never = true;

type BroadcastPayload = Parameters<typeof postsChannel.broadcast>[1];

export const broadcastPayloadIsTyped: IsAny<BroadcastPayload> extends true
  ? never
  : BroadcastPayload extends { id: number; createdAt: Date }
    ? true
    : never = true;

export async function broadcastsThroughTheDefinition(post: {
  id: number;
  title: string;
  body: string;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  await postsChannel.broadcast("created", post);

  // @ts-expect-error posts declares no deleted event
  await postsChannel.broadcast("deleted", post);
  // @ts-expect-error created takes the post's Date, not a string
  await postsChannel.broadcast("created", { ...post, createdAt: "2026-01-01" });
}
