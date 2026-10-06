import {
  emit as emitInTest,
  expectEmitted,
  expectListenerQueued,
  expectListenerRan,
  runListener,
} from "@nuxvel/nuxt/testing";
import * as testNamespaces from "#build/nuxvel/test-namespaces.mjs";
import { probeTransformed } from "~~/server/events/_probe/transformed";

type IsAny<T> = 0 extends 1 & T ? true : false;

function typed<T>(value: IsAny<T> extends true ? never : T) {
  return value;
}

export async function emitsTheEventObject() {
  await probeTransformed.emit({ names: "a,b" });

  // @ts-expect-error emit takes the schema's input, not its parsed output
  await probeTransformed.emit({ names: ["a", "b"] });
}

export const listenerGetsParsedOutput = defineListener({
  event: probeTransformed,
  handler: ({ names }) => {
    typed(names).join(",");
  },
});

export const eventNameIsTyped: IsAny<EventName> extends true
  ? never
  : string extends EventName
    ? never
    : "_probe.happened" | "_probe.queued" | "_probe.transformed" extends EventName
      ? true
      : never = true;

export const eventPayloadIsParsedOutput: EventPayload<"_probe.transformed"> extends {
  names: string[];
}
  ? true
  : never = true;

export async function emitsByName() {
  await $events._probe.transformed.emit({ names: "a,b" });

  // @ts-expect-error no event has this name
  await $events._probe.missing.emit({ names: "a,b" });

  // @ts-expect-error the payload type follows the event name
  await $events._probe.transformed.emit({ names: ["a", "b"] });
}

type NamespacedEvent = typeof $events._probe.happened;
type NamespacedListener = typeof $listeners._recordProbeSync;

export const eventsNamespaceIsTyped: IsAny<NamespacedEvent> extends true ? never : NamespacedEvent extends DomainEvent ? true : never = true;
export const listenersNamespaceIsTyped: IsAny<NamespacedListener> extends true ? never : NamespacedListener extends Listener ? true : never = true;

export async function eventFixturesTakeADefinitionOrATestStub() {
  await emitInTest($events._probe.transformed, { names: "a,b" });
  await emitInTest(testNamespaces.$events._probe.transformed, { names: "a,b" });
  await expectEmitted(testNamespaces.$events._probe.transformed, { names: ["a", "b"] });
  await expectEmitted($events._probe.happened);
  await runListener(testNamespaces.$listeners._recordProbeQueued, { name: "typed" });
  await expectListenerRan($listeners._recordProbeSync);
  await expectListenerQueued(testNamespaces.$listeners._recordProbeQueued);

  // @ts-expect-error the test emit takes the schema's input, not its parsed output
  await emitInTest(testNamespaces.$events._probe.transformed, { names: ["a", "b"] });
  // @ts-expect-error expectEmitted matches the parsed payload
  await expectEmitted($events._probe.transformed, { names: "a,b" });
}

type EmitPayload = Parameters<typeof $events._probe.transformed.emit>[0];

export const emitPayloadIsTyped: IsAny<EmitPayload> extends true
  ? never
  : EmitPayload extends { names: string }
    ? true
    : never = true;
