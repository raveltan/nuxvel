import { type AnyMiddlewareFunction, type AnyRouter, createInputMiddleware } from "@trpc/server/unstable-core-do-not-import";
import type { z } from "zod";
import { currentLocale } from "../i18n/current-locale";
import { zodLocaleError } from "../i18n/zod-locale-error";

type ProcedureDef = { inputs: unknown[]; middlewares: AnyMiddlewareFunction[] };

function isZodSchema(parser: unknown): parser is z.ZodType {
  return typeof parser === "object" && parser !== null && "_zod" in parser && "parseAsync" in parser;
}

function localizedInput(schema: z.ZodType): AnyMiddlewareFunction {
  return (opts) => {
    const given: unknown = opts.ctx?.locale;
    const error = zodLocaleError(typeof given === "string" ? given : currentLocale());

    return createInputMiddleware((value) => schema.parseAsync(value, { error }))(opts);
  };
}

export function localizeInputs<Router extends AnyRouter>(router: Router): Router {
  for (const procedure of Object.values(router._def.procedures)) {
    // tRPC binds each .input() parser when the procedure is built and gives it no parse options, so the input middlewares are rebuilt with the locale error map
    const { inputs, middlewares } = (procedure as { _def: ProcedureDef })._def;
    let index = 0;

    middlewares.forEach((middleware, position) => {
      if (middleware._type !== "input") return;
      const schema = inputs[index++];
      if (isZodSchema(schema)) middlewares[position] = Object.assign(localizedInput(schema), { _type: "input" });
    });
  }

  return router;
}
