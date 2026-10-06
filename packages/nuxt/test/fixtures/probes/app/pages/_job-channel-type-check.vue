<script setup lang="ts">
type IsAny<T> = 0 extends 1 & T ? true : false;

const { events } = useJobChannel("demo.countdown");

type Message = (typeof events.value)[number];
type Completed = Extract<Message, { event: "completed" }>["payload"]["result"];

const messagesAreTyped: IsAny<Message> extends true
  ? never
  : Message["event"] extends "started" | "progress" | "completed" | "failed"
    ? true
    : never = true;
const resultIsTyped: IsAny<Completed> extends true
  ? never
  : Completed extends { finishedAt: Date }
    ? true
    : never = true;

// @ts-expect-error probe.record has no channel
useJobChannel("_probe.record");

const stubbed = useJobChannel($jobs.demo.countdown);

type StubbedCompleted = Extract<(typeof stubbed.events.value)[number], { event: "completed" }>["payload"]["result"];

const stubIsTyped: IsAny<StubbedCompleted> extends true
  ? never
  : StubbedCompleted extends { finishedAt: Date }
    ? true
    : never = true;

// @ts-expect-error probe.record has no channel
useJobChannel($jobs._probe.record);

const countdown = useJobChannel("demo.countdown");

type CountdownResult = typeof countdown.result.value;
type CountdownStatus = typeof countdown.status.value;
type RunStatus = "idle" | "running" | "completed" | "failed";

const jobResultIsTyped: IsAny<CountdownResult> extends true
  ? never
  : CountdownResult extends { finishedAt: Date } | undefined
    ? undefined extends CountdownResult
      ? true
      : never
    : never = true;
const jobStatusIsTyped: [CountdownStatus] extends [RunStatus] ? ([RunStatus] extends [CountdownStatus] ? true : never) : never = true;
const jobProgressIsTyped: IsAny<typeof countdown.progress.value> extends true
  ? never
  : [typeof countdown.progress.value] extends [number | undefined]
    ? true
    : never = true;
const jobErrorIsTyped: IsAny<typeof countdown.error.value> extends true
  ? never
  : [typeof countdown.error.value] extends [string | undefined]
    ? true
    : never = true;
</script>

<template>
  <div>{{ messagesAreTyped }} {{ resultIsTyped }} {{ stubIsTyped }} {{ events.length }} {{ jobResultIsTyped }} {{ jobStatusIsTyped }} {{ jobProgressIsTyped }} {{ jobErrorIsTyped }}</div>
</template>
