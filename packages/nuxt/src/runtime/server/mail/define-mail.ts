import type { VNode } from "vue";
import type { z } from "zod";
import { awaitingName } from "../discovery/definition-name";
import { currentLocale } from "../i18n/current-locale";
import { type Translate, translator } from "../i18n/translator";
import { renderEmail } from "./render-email";

/** The input every mail's schema must produce: at least who it goes to. */
export type MailSchema = z.ZodType<{ to: string }>;

/** A rendered mail body: the HTML part and its plain-text version. */
export interface RenderedMail {
  html: string;
  text: string;
}

/**
 * What a mail's `subject` gets next to its input: `t`, which gives the
 * text of a key of the `locales/` files in the locale of the mail, and
 * that `locale`.
 */
export interface MailI18n {
  t: Translate;
  locale: string;
}

/**
 * A mail definition: its name, input schema, subject and the message it
 * renders to. The name is its file's path under `server/mail/`.
 */
export interface Mail<Name extends string = string, Schema extends MailSchema = MailSchema> {
  readonly name: Name;
  input: Schema;
  subject(input: z.infer<Schema>, locale?: string): string;
  render(input: z.infer<Schema>, locale?: string): Promise<RenderedMail>;
  preview?: () => z.input<Schema>;
}

/**
 * Defines a mail: a Vue template rendered to HTML on the server.
 *
 * `defineMail` is auto-imported. One mail per file, under `server/mail/`,
 * with its Vue templates alongside it; the file is discovered, so nothing
 * registers it, and its path is the mail's name
 * (`server/mail/order/shipped.mail.ts` is `"order.shipped"`). Send it by name
 * with {@link sendMail}; the name is part of {@link MailName}, so sending
 * a misspelled name fails to compile.
 *
 * Templates use the MJML components (`<EButton>`, `<EText>`, ...) and
 * {@link MailLayout} without importing them; they are registered for
 * mail templates only, and MJML attributes style them. The returned
 * mail's `render(input)` server-renders the template to MJML, converts
 * it to HTML with the Outlook fallbacks, and resolves to the HTML and a
 * plain-text version made from it. It throws when the template renders
 * invalid MJML, with the tag and the line of each error.
 *
 * A mail renders in one locale: the `locale` option of {@link sendMail},
 * else {@link currentLocale}. The template translates with `$t(key,
 * params)` and `subject` with `t`, from the global `locales/<code>.json`
 * files of the app. A key that the locale does not have comes from the
 * default locale, then from `en`. `render(input, locale?)` and
 * `subject(input, locale?)` of the returned mail take the same locale.
 *
 * @param config.input Zod schema describing the data the mail needs; its
 * `to` field is the recipient.
 * @param config.subject Builds the subject line from the input, with
 * `t` and `locale` of the mail ({@link MailI18n}).
 * @param config.render Builds the template's vnode from the input
 * without `to`, usually `h(Template, props)`. The template does not get
 * the recipient, so the address does not show in the HTML as an attribute.
 * @param config.preview Optional. Returns the input that the DevTools
 * mail preview starts with. Without it, the preview starts with a sample
 * made from `input`.
 *
 * @example
 * ```ts
 * // server/mail/welcome.mail.ts
 * import { h } from "vue";
 * import Welcome from "./templates/Welcome.vue";
 *
 * export const welcomeMail = defineMail({
 *   input: z.object({ to: z.email(), name: z.string() }),
 *   subject: ({ name }, { t }) => t("mail.welcome.subject", { name }),
 *   render: (props) => h(Welcome, props),
 *   preview: () => ({ to: "ada@example.com", name: "Ada" }),
 * });
 * ```
 */
export function defineMail<Schema extends MailSchema, const Preview extends z.input<Schema> = z.input<Schema>>(config: {
  input: Schema;
  subject: (input: z.infer<Schema>, i18n: MailI18n) => string;
  render: (props: Omit<z.infer<Schema>, "to">) => VNode;
  preview?: () => Preview;
}): Mail<string, Schema> {
  return awaitingName(
    {
      name: "",
      input: config.input,
      subject: (input: z.infer<Schema>, locale = currentLocale()) => config.subject(input, { t: translator(locale), locale }),
      render: ({ to: _to, ...props }: z.infer<Schema>, locale = currentLocale()) => renderEmail(config.render(props), translator(locale)),
      preview: config.preview,
    },
    "mail",
  );
}
