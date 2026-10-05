import actions from "#nuxvel/actions";
import type { ActionContext } from "../actions/define-action";

type Discovered = (typeof actions)[number];

export type ActionName = Discovered["actionName"];

type ActionNamed<Name extends ActionName> = Extract<Discovered, { actionName: Name }>;

export type ActionInput<Name extends ActionName> = Parameters<ActionNamed<Name>>[0];

export type ActionOutput<Name extends ActionName> = Awaited<ReturnType<ActionNamed<Name>>>;

type RunnableAction = ((input: unknown, ctx: ActionContext) => Promise<unknown>) & {
  actionName: string;
};

function isRunnable(value: unknown): value is RunnableAction {
  return typeof value === "function" && "actionName" in value && typeof value.actionName === "string";
}

export function findAction(name: string): RunnableAction | undefined {
  const discovered: readonly unknown[] = actions;

  return discovered.filter(isRunnable).find((action) => action.actionName === name);
}
