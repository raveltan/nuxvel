<script setup lang="ts">
type IsAny<T> = 0 extends 1 & T ? true : false;

const { events } = useJobChannel("demo.countdown");

type Message = (typeof events.value)[number];
type Completed = Extract<Message, { event: "completed" }>["payload"]["result"];

const messagesAreTyped: IsAny<Message> extends true
  ? never
  : Message["event"] extends "progress" | "completed" | "failed"
    ? true
    : never = true;
const resultIsTyped: IsAny<Completed> extends true
  ? never
  : Completed extends { finishedAt: string }
    ? true
    : never = true;

// @ts-expect-error probe.record has no channel
useJobChannel("_probe.record");

const stubbed = useJobChannel($jobs.demo.countdown);

type StubbedCompleted = Extract<(typeof stubbed.events.value)[number], { event: "completed" }>["payload"]["result"];

const stubIsTyped: IsAny<StubbedCompleted> extends true
  ? never
  : StubbedCompleted extends { finishedAt: string }
    ? true
    : never = true;

// @ts-expect-error probe.record has no channel
useJobChannel($jobs._probe.record);
</script>

<template>
  <div>{{ messagesAreTyped }} {{ resultIsTyped }} {{ stubIsTyped }} {{ events.length }}</div>
</template>
