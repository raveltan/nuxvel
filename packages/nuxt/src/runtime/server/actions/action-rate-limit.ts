import { consumeLimit } from "../security/consume-limit";
import type { RateLimit } from "../security/define-rate-limit";
import { ipKey, requestEvent } from "../security/rate-limit-key";
import { type RateLimitName, sharedLimit } from "../security/rate-limit-registry";
import { type RateLimitWindow, checkedPoints, windowSeconds } from "../security/rate-limit-window";
import type { Actor } from "./system-actor";

type ActionRateLimitBy<Input> = "ip" | "user" | ((ctx: { input: Input; actor: Actor }) => string);

/**
 * The `rateLimit` option of {@link defineAction}: how many calls one key
 * may make inside a sliding window. Either written in place, counted
 * under the action's name, or a shared `limit` from `server/rate-limits/`
 * (its name or its {@link defineRateLimit} definition), counted under
 * that limit's name with every other use of it.
 */
export type ActionRateLimit<Input> =
  | {
      /** Calls allowed inside one window, per key. */
      points: number;
      /** How long the sliding window lasts, e.g. `{ minutes: 1 }`. */
      window: RateLimitWindow;
      /**
       * Who shares one budget: `"ip"` (needs a request), `"user"` (needs a
       * user actor) or a function of the parsed `input` and the `actor`.
       */
      by: ActionRateLimitBy<Input>;
    }
  | {
      /** The shared limit to count against. */
      limit: RateLimitName | RateLimit;
      /** Who shares one budget, as for a limit written in place. */
      by: ActionRateLimitBy<Input>;
    };

function actionKey<Input>(actionName: string, by: ActionRateLimitBy<Input>, input: Input, actor: Actor) {
  if (by === "ip") return ipKey(requestEvent(`the action ${actionName}`));
  if (by !== "user") return by({ input, actor });

  if (actor.type !== "user") {
    throw new Error(
      `nuxvel: the action ${actionName} is rate limited by "user", but a "${actor.type}" actor (${actor.id}) called it; call it as a user, or limit it by "ip" or a key function`,
    );
  }

  return `user:${actor.id}`;
}

function budgetOf<Input>(rateLimit: ActionRateLimit<Input>): (actionName: string) => {
  counter: string;
  points: number;
  seconds: number;
} {
  if ("limit" in rateLimit) {
    const { limit } = rateLimit;

    return () => {
      const { name, points, seconds } = sharedLimit(typeof limit === "string" ? limit : limit.name);

      return { counter: name, points, seconds };
    };
  }

  const points = checkedPoints(rateLimit.points);
  const seconds = windowSeconds(rateLimit.window);

  return (actionName) => ({ counter: `action/${actionName}`, points, seconds });
}

export function actionRateLimiter<Input>(rateLimit: ActionRateLimit<Input>) {
  const budget = budgetOf(rateLimit);

  return (actionName: string, input: Input, actor: Actor) => {
    const { counter, points, seconds } = budget(actionName);

    return consumeLimit(`${counter}:${actionKey(actionName, rateLimit.by, input, actor)}`, points, seconds);
  };
}
