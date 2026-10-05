<script setup lang="ts">
type IsAny<T> = 0 extends 1 & T ? true : false;

const { members, setState } = usePresence("posts", { id: 1 });

type State = (typeof members.value)[number]["state"];

const stateIsTyped: IsAny<State> extends true
  ? never
  : [State] extends [{ typing?: boolean }]
    ? [{ typing?: boolean }] extends [State]
      ? true
      : never
    : never = true;

setState({ typing: true });

// @ts-expect-error typing is a boolean
setState({ typing: "yes" });

// @ts-expect-error the _probe-public channel does not set presence
usePresence("_probe-public");

const stubbed = usePresence($channels.posts, { id: 1 });

type StubbedState = (typeof stubbed.members.value)[number]["state"];

const stubIsTyped: IsAny<StubbedState> extends true
  ? never
  : [StubbedState] extends [{ typing?: boolean }]
    ? true
    : never = true;

// @ts-expect-error typing is a boolean
stubbed.setState({ typing: "yes" });

// @ts-expect-error the _probe-public channel does not set presence
usePresence($channels._probePublic);
</script>

<template>
  <div>
    {{ stateIsTyped }} {{ stubIsTyped }}
    <PresenceAvatars :members="members" />
    <TypingIndicator :members="members" />
  </div>
</template>
