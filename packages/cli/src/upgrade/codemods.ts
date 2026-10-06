import type { Codemod } from "./codemod.ts";
import { testAliases } from "./codemods/test-aliases.ts";

export const codemods: Codemod[] = [testAliases];
