import type { ObservedActionCall } from "../../runtime/server/observe/channels";
import type { ActionName } from "../../runtime/server/testing/action-registry";
import { recordedEffects } from "../recorded";
import { expectRecorded } from "./records";

/**
 * Asserts that the app called an action during the test, as the given actor, and returns the latest such call.
 *
 * Use it to prove that a router hands off to its action as the right actor. A call counts whether it succeeded or failed: the returned record has `ok`. Takes the vocabulary of {@link runAction}. Cleared after every test by `@nuxvel/nuxt/testing/setup`.
 *
 * @param name An action's `actionName`, or the action's definition or its stub from `#nuxvel/test-namespaces`.
 * @param options.actingAs Only counts calls that ran as this user.
 * @param options.asSystem Only counts calls that ran as the system actor with this name.
 * @param options.times How many matching calls there must be, 1 or more.
 *
 * @example
 * ```ts
 * await actingAs(author).api.post.update({ id: post.id, title: "New" });
 * await expectActionCalled("posts.update-post", { actingAs: author });
 * ```
 */
export async function expectActionCalled(
  name: ActionName | { actionName?: string; name: string },
  options: { actingAs?: { id: string }; asSystem?: string; times?: number } = {},
): Promise<ObservedActionCall> {
  const action = typeof name === "string" ? name : (name.actionName ?? name.name);
  const { actionCalls } = await recordedEffects();
  const actorType = options.actingAs ? "user" : options.asSystem === undefined ? undefined : "system";
  const actorId = options.actingAs?.id ?? options.asSystem;

  return expectRecorded(
    "expectActionCalled",
    `a call of action "${action}"${actorType ? ` as ${actorType}:${actorId}` : ""}`,
    actionCalls,
    (call) => call.action === action && (actorType === undefined || (call.actor.type === actorType && call.actor.id === actorId)),
    options.times,
  );
}
