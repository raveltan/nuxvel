import { z } from "zod";
import { defineAction, systemActor } from "@nuxvel/nuxt/server/actions";
import { publicProcedure } from "@nuxvel/nuxt/server/api";
import { currentLocale } from "@nuxvel/nuxt/server/i18n";

const titleInput = z.object({ title: z.string().min(3) });

const localeOfAction = probeNamed("_locale-check.localeOfAction", defineAction({
  handler: (_input, { locale }) => ({ action: locale, inAction: currentLocale() }),
}));

const validatedAction = probeNamed("_locale-check.validatedAction", defineAction({
  input: titleInput,
  handler: ({ title }) => title,
}));

export default {
  current: publicProcedure.query(async ({ ctx }) => ({
    context: ctx.locale,
    request: currentLocale(),
    ...(await localeOfAction({}, { actor: systemActor("_locale-check") })),
  })),
  given: publicProcedure.query(() => localeOfAction({}, { actor: systemActor("_locale-check"), locale: "zh" })),
  validated: publicProcedure.input(titleInput).mutation(({ input }) => input.title),
  validatedAction: publicProcedure.mutation(({ ctx }) => validatedAction({ title: "a" }, { actor: systemActor("_locale-check"), locale: ctx.locale })),
};
