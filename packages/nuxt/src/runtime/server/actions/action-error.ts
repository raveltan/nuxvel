import { TaxonomyError, isTaxonomyError } from "../errors/taxonomy";

/**
 * Error thrown by an action's `fail(code)`: an expected business-rule
 * failure. Surfaces as HTTP 422 (tRPC `UNPROCESSABLE_CONTENT`).
 *
 * `actionCode` is one of the keys declared in the action's `errors` map;
 * a procedure sends it to the client as `data.actionCode`, and its
 * message survives production. `action` is the failing action's name
 * when `fail()` threw it. Branch on it with {@link isActionError}.
 */
export class ActionError extends TaxonomyError {
  declare readonly code: "UNPROCESSABLE_CONTENT";
  readonly actionCode: string;
  readonly action: string | undefined;

  constructor(actionCode: string, message: string, action?: string) {
    super("UNPROCESSABLE_CONTENT", message);
    this.actionCode = actionCode;
    this.action = action;
  }
}

interface ActionWithErrors {
  readonly actionName: string;
  readonly errors: Partial<Record<string, string>>;
}

/** The error codes an action from `defineAction` declares, as a union. */
export type ActionErrorCode<Action extends ActionWithErrors> = keyof Action["errors"] &
  string;

/**
 * Narrows an unknown error to an {@link ActionError}.
 *
 * Pass the action to match only its failures, with `code` checked
 * against the codes it declares; pass just a code to match that code
 * from any action.
 *
 * @example
 * ```ts
 * catch (error) {
 *   if (isActionError(error, updatePost, "post.locked")) return null;
 *   throw error;
 * }
 * ```
 */
export function isActionError<
  Action extends ActionWithErrors,
  Code extends ActionErrorCode<Action>,
>(err: unknown, action: Action, code: Code): err is ActionError & { actionCode: Code };
export function isActionError<Code extends string>(
  err: unknown,
  code: Code,
): err is ActionError & { actionCode: Code };
export function isActionError(
  err: unknown,
  actionOrCode: ActionWithErrors | string,
  code?: string,
): err is ActionError {
  if (!isTaxonomyError(err, "UNPROCESSABLE_CONTENT")) return false;

  if (typeof actionOrCode === "string") return err.actionCode === actionOrCode;

  return err.action === actionOrCode.actionName && err.actionCode === code;
}
