import type { Codemod } from "./codemod.ts";
import { actionForm } from "./codemods/action-form.ts";
import { actorArg } from "./codemods/actor-arg.ts";
import { audit } from "./codemods/audit.ts";
import { definitionMethods } from "./codemods/definition-methods.ts";
import { durations } from "./codemods/durations.ts";
import { imports } from "./codemods/imports.ts";
import { invalidate } from "./codemods/invalidate.ts";
import { mutationOptions } from "./codemods/mutation-options.ts";
import { presenceParams } from "./codemods/presence-params.ts";
import { removedGlobals } from "./codemods/removed-globals.ts";
import { testAliases } from "./codemods/test-aliases.ts";
import { useTrpc } from "./codemods/use-trpc.ts";

export const codemods: Codemod[] = [testAliases, imports, useTrpc, invalidate, mutationOptions, audit, actionForm, actorArg, removedGlobals, definitionMethods, durations, presenceParams];
