import type { Codemod } from "./codemod.ts";
import { imports } from "./codemods/imports.ts";
import { invalidate } from "./codemods/invalidate.ts";
import { testAliases } from "./codemods/test-aliases.ts";
import { useTrpc } from "./codemods/use-trpc.ts";

export const codemods: Codemod[] = [testAliases, imports, useTrpc, invalidate];
