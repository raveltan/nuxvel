import type { AnyProcedureBuilder, MutationProcedure } from "@trpc/server/unstable-core-do-not-import";
import type { Action } from "../actions/define-action";
import { adminProcedure, authedProcedure, publicProcedure } from "./procedures";
import type { t } from "./trpc";

type Meta = (typeof t)["_config"]["$types"]["meta"];

const NAMED_PROCEDURES: Record<string, AnyProcedureBuilder> = {
  public: publicProcedure,
  authed: authedProcedure,
  admin: adminProcedure,
};

function isNode(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function mountAction<Input, Output, Served>(
  action: Action<Input, Output, Record<string, string>, string, Served>,
): MutationProcedure<{ input: Input; output: Served; meta: Meta }> {
  const procedure = typeof action.procedure === "string" ? NAMED_PROCEDURES[action.procedure] : action.procedure;

  if (!procedure) throw new Error(`nuxvel: the action ${action.actionName} has no procedure`);

  return procedure.action(action);
}

export function mountActions<Router extends object, Mounted extends object>(router: Router, mounted: Mounted, file: string): Router & Mounted {
  const merged: Record<string, unknown> = {};
  Object.assign(merged, router);

  for (const [key, value] of Object.entries(mounted)) {
    const existing = merged[key];

    if (existing === undefined) merged[key] = value;
    else if (isNode(existing) && isNode(value)) merged[key] = mountActions(existing, value, file);
    else throw new Error(`nuxvel: ${file} and an action with a procedure both define the tRPC procedure "${key}"`);
  }

  // the keys of Mounted were added to a copy of Router above
  return merged as Router & Mounted;
}
