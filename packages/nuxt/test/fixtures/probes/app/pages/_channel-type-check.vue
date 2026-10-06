<script setup lang="ts">
type IsAny<T> = 0 extends 1 & T ? true : false;

const { events, status } = useChannel("_probe-public");

type Received = (typeof events.value)[number];
type Renamed = Extract<Received, { event: "renamed" }>["payload"];

const eventsAreTyped: IsAny<Received> extends true
  ? never
  : [Received["event"]] extends ["renamed" | "from-job" | "checked"]
    ? ["renamed" | "from-job" | "checked"] extends [Received["event"]]
      ? true
      : never
    : never = true;
const payloadIsTyped: IsAny<Renamed> extends true
  ? never
  : Renamed extends { id: number }
    ? true
    : never = true;
type Status = typeof status.value;
type Expected = "connecting" | "open" | "reconnecting" | "closed";

const statusIsTyped: [Status] extends [Expected] ? ([Expected] extends [Status] ? true : never) : never = true;

const stubbed = useChannel($channels.posts);

type StubbedMessage = (typeof stubbed.events.value)[number];

const stubIsTyped: IsAny<StubbedMessage> extends true
  ? never
  : StubbedMessage extends { event: "created"; payload: { createdAt: Date } }
    ? true
    : never = true;

// @ts-expect-error no channel is named probe-missing
useChannel("probe-missing");

const room = useChannel("_probe-board", { params: { boardId: 1 }, limit: 10 });

useChannel($channels._probeBoard, { params: { boardId: "1" } });
useChannel("_probe-board");

type RoomMessage = (typeof room.events.value)[number];

const roomIsTyped: IsAny<RoomMessage> extends true
  ? never
  : RoomMessage extends { event: "moved"; payload: { card: number } }
    ? true
    : never = true;

// @ts-expect-error _probe-board names boardId, not board
useChannel("_probe-board", { params: { board: 1 } });
// @ts-expect-error _probe-board names boardId, not board
useChannel($channels._probeBoard, { params: { board: 1 } });
// @ts-expect-error _probe-public names no params
useChannel("_probe-public", { params: { id: 1 } });
</script>

<template>
  <div>{{ eventsAreTyped }} {{ payloadIsTyped }} {{ statusIsTyped }} {{ stubIsTyped }} {{ roomIsTyped }} {{ events.length }}</div>
</template>
