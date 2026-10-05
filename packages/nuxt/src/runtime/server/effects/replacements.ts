import type { DispatchOptions } from "../utils/dispatch-after-commit";

/** One enqueue: the job's queue and dispatch name, the payload envelope it carries and its dispatch options. */
export interface QueuedJob {
  queue: string;
  name: string;
  payload: unknown;
  options: DispatchOptions;
}

/**
 * The side effects the test harness runs in place of the real one.
 * Nothing is installed outside tests. Effects the harness only watches
 * are published on the channels of {@link ObservedEffects} instead.
 */
export interface EffectReplacements {
  /** Runs instead of adding a relayed outbox row to the BullMQ queue. */
  enqueue: (job: QueuedJob) => void;
  /** Runs instead of sending one web push through its push service, answering with that service's HTTP status. */
  deliverPush: (endpoint: string, payload: string) => number;
  /** Answers each request of {@link useStripe} instead of Stripe, so a test never reaches the network. */
  stripeFetch: (...request: Parameters<typeof fetch>) => Promise<Response>;
}

type ReplacedEffect = keyof EffectReplacements;

const installed: { [Name in ReplacedEffect]?: EffectReplacements[Name] } = {};

/**
 * Installs every replacement, replacing what was installed. The test
 * harness's nitro plugin calls it; application code has no reason to.
 */
export function installEffectReplacements(replacements: EffectReplacements) {
  Object.assign(installed, replacements);
}

/** Removes one replacement, so that effect runs for real again. */
export function removeEffectReplacement(name: ReplacedEffect) {
  delete installed[name];
}

/** The installed replacement for this effect, or `undefined` outside tests. */
export function effectReplacement<Name extends ReplacedEffect>(name: Name): EffectReplacements[Name] | undefined {
  return installed[name];
}
