import type { Codemod } from "./codemod.ts";
import { imports } from "./codemods/imports.ts";
import { testAliases } from "./codemods/test-aliases.ts";

export const codemods: Codemod[] = [testAliases, imports];
