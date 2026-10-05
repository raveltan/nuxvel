type IsAny<T> = 0 extends 1 & T ? true : false;

type ChannelConfig = Parameters<typeof defineChannel>[0];
type AuthorizeConnection = Parameters<ChannelConfig["authorize"]>[0];

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

export async function broadcastsOnlyDeclaredEvents(post: {
  id: number;
  title: string;
  body: string;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  await broadcast("posts", "created", post);

  // @ts-expect-error no channel is named probe-missing
  await broadcast("probe-missing", "created", post);
  // @ts-expect-error posts declares no deleted event
  await broadcast("posts", "deleted", post);
  // @ts-expect-error created takes the post's Date, not a string
  await broadcast("posts", "created", { ...post, createdAt: "2026-01-01" });
}

export async function broadcastsADefinition(post: {
  id: number;
  title: string;
  body: string;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  await broadcast($channels.posts, "created", post);

  // @ts-expect-error posts declares no deleted event
  await broadcast($channels.posts, "deleted", post);
  // @ts-expect-error created takes the post's Date, not a string
  await broadcast($channels.posts, "created", { ...post, createdAt: "2026-01-01" });
}

export async function broadcastsToARoom() {
  await broadcast("_probe-board", "moved", { card: 1 }, { boardId: 1 });
  await broadcast($channels._probeBoard, "moved", { card: 1 }, { boardId: "1" });
  await broadcastAfterCommit("_probe-board", "moved", { card: 1 }, { boardId: 1 });
  await broadcastAfterCommit($channels._probeBoard, "moved", { card: 1 }, { boardId: 1 });
  await broadcast("_probe-board", "moved", { card: 1 });

  // @ts-expect-error _probe-board names boardId, not board
  await broadcast("_probe-board", "moved", { card: 1 }, { board: 1 });
  // @ts-expect-error _probe-board names boardId, not board
  await broadcast($channels._probeBoard, "moved", { card: 1 }, { board: 1 });
  // @ts-expect-error _probe-board names boardId, not board
  await broadcastAfterCommit("_probe-board", "moved", { card: 1 }, { board: 1 });
  // @ts-expect-error _probe-board names boardId, not board
  await broadcastAfterCommit($channels._probeBoard, "moved", { card: 1 }, { board: 1 });
  // @ts-expect-error a room needs every param
  await broadcast("_probe-board", "moved", { card: 1 }, {});
  // @ts-expect-error _probe-public names no params
  await broadcast("_probe-public", "renamed", { id: 1 }, { id: 1 });
  // @ts-expect-error _probe-public names no params
  await broadcast($channels._probePublic, "renamed", { id: 1 }, { id: 1 });
}

export async function presenceOfADefinition() {
  const [member] = await presenceOf($channels.posts, { id: 1 });
  const typing: boolean | undefined = member?.state.typing;

  // @ts-expect-error _probe-public sets no presence
  await presenceOf($channels._probePublic);

  return typing;
}

type NamespacedChannel = typeof $channels.posts;

export const channelsNamespaceIsTyped: IsAny<NamespacedChannel> extends true ? never : NamespacedChannel extends Channel ? true : never = true;
