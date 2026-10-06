import type { Action, ActionFailure } from "../actions/define-action";
import { type Named, named, namedOnRead } from "./definition-name";
import { isRenamed } from "./renamed";

type ValuesOf<Module> = Module extends unknown ? Module[keyof Module] : never;

/** Any action from {@link defineAction}, whatever its input, output and errors. */
export type AnyAction = Action<never, unknown, Record<string, ActionFailure>>;

type ActionOf<Module> = Extract<ValuesOf<Module>, AnyAction>;

type Discovered<Modules extends readonly (readonly [object, string, string])[]> = {
  [Index in keyof Modules]: Named<ActionOf<Modules[Index][0]>, Modules[Index][2]>;
}[number];

function isAction(value: unknown): value is AnyAction {
  return typeof value === "function" && "actionName" in value;
}

/**
 * Names the {@link defineAction} action each discovered `server/actions/`
 * module exports after the module's path, throwing when one exports more
 * than one. The generated `#nuxvel/actions` module calls it, and the actions are
 * named on the first read of the array, or at boot.
 */
export function discoveredActions<const Modules extends readonly (readonly [object, string, string])[]>(
  modules: Modules,
): Discovered<Modules>[] {
  return namedOnRead(() => modules.flatMap(([module, file, name]) => {
    if (Object.values(module).some(isRenamed)) {
      throw new Error(`nuxvel: ${file} exports renamed(), but an action stores nothing under its name; delete the old file`);
    }

    const actions = Object.values(module).filter(isAction);

    if (actions.length > 1) {
      throw new Error(`nuxvel: ${file} exports ${actions.length} actions; an action is named after its file, so give each its own`);
    }

    // each action is named after its module's entry, which is what Discovered<> maps
    return actions.map((action) => named(action, name, file) as Discovered<Modules>);
  }));
}
