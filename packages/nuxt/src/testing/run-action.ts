import type { Action } from "../runtime/server/actions/define-action";
import type {
  ActionInput,
  ActionName,
  ActionOutput,
} from "../runtime/server/testing/action-registry";
import { callApp } from "./settled";

/**
 * Options for {@link runAction}: who the action runs as. Give `actingAs`
 * or `asSystem`, not both.
 */
export type RunActionOptions =
  | {
      /** The user the action runs as: its actor, role included, is built from their row. */
      actingAs: { id: string };
      asSystem?: never;
    }
  | {
      /**
       * The name of the system actor the action runs as, as in
       * `systemActor(name)`. Use it for an action that a router, a job or a
       * schedule calls with a system actor, such as a form for visitors.
       */
      asSystem: string;
      actingAs?: never;
    };

/**
 * Calls a {@link defineAction} action, by its name or its definition, in
 * the app under test, as a user or as a system actor, and resolves to what
 * it returns.
 *
 * For an action no procedure exposes yet, or to test one apart from its
 * router — reach for {@link actingAs} to go through the procedure. The
 * action validates, opens its transaction and traces exactly as when a
 * procedure calls it; a `fail()` rejects for {@link toBeActionError} and
 * invalid input for {@link toHaveValidationErrors}.
 *
 * @param name An action's `actionName`, or the action's definition or its
 * stub from `#nuxvel/test-namespaces`; a name no file under
 * `server/actions/` defines fails to compile.
 * @param input The action's input, before its schema parses it.
 * @param options See {@link RunActionOptions}.
 *
 * @example
 * ```ts
 * import { $actions } from "#nuxvel/test-namespaces";
 *
 * const post = await runAction($actions.posts.createPost, { title: "Hi", body: "" }, { actingAs: author });
 * await runAction("posts.archive-old-posts", {}, { asSystem: "nightly-cleanup" });
 * ```
 */
export async function runAction<Name extends ActionName>(
  name: Name,
  input: ActionInput<Name>,
  options: RunActionOptions,
): Promise<ActionOutput<Name>>;
export async function runAction<Input, Output, Errors extends Record<string, string>>(
  action: Action<Input, Output, Errors>,
  input: Input,
  options: RunActionOptions,
): Promise<Output>;
export async function runAction(
  nameOrAction: string | { actionName?: string; name: string },
  input: unknown,
  options: RunActionOptions,
): Promise<unknown> {
  // a test stub carries only `name`; an imported action carries `actionName`, and `name` is its function's name
  const name = typeof nameOrAction === "string" ? nameOrAction : (nameOrAction.actionName ?? nameOrAction.name);

  return await callApp("run-action", { name, input, userId: options.actingAs?.id, systemName: options.asSystem });
}
