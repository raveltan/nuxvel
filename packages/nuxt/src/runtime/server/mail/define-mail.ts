import { type Component, type VNode, h } from "vue";
import type { z } from "zod";
import templates from "#nuxvel/mail-templates";
import { awaitingName } from "../discovery/definition-name";
import { currentLocale } from "../i18n/current-locale";
import { type Translate, translator } from "../i18n/translator";
import { renderEmail } from "./render-email";
import type { SendMailOptions } from "./send-mail";

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

type Templates = typeof templates;

/** The name of every mail template under `server/mail/templates/`: what {@link defineMail}'s `template` takes. */
export type MailTemplateName = keyof Templates & string;

/** The props the mail template named `Name` declares. */
export type MailTemplateProps<Name extends MailTemplateName> = Templates[Name] extends new (...args: never[]) => { $props: infer Props }
  ? Props
  : never;

type Fitting<Props> = {
  [Name in MailTemplateName]: Props extends MailTemplateProps<Name> ? Name : never;
}[MailTemplateName];

type TemplateFor<Props> = [Fitting<Props>] extends [never] ? "no mail template takes this input" : Fitting<Props>;

const registered: Readonly<Record<string, Component>> = templates;

function templateVNode(name: string | undefined, props: object) {
  const template = name && registered[name];

  if (!template) throw new Error(`No mail template is named "${name}"`);

  return h(template, props);
}

type Body<Props> = { template: TemplateFor<Props>; render?: never } | { render: (props: Props) => VNode; template?: never };

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
  /**
   * Sends this mail with `input`, once the surrounding transaction
   * commits. Outside a transaction it is queued now.
   *
   * Validates `input` against the mail's schema, throwing a
   * `ValidationFailedError`, and renders it now, then queues the
   * rendered message as a `nuxvel.mail` job, so sending never blocks the
   * request and a rollback sends nothing. A recipient recorded with
   * `suppressMail()` is skipped with a log line. Throws when
   * `nuxvel.mail.from` is not configured. `sendMailNow()` sends without
   * the queue.
   *
   * @param options.locale The locale code the mail renders in. The
   * locale of the request or the action when unset.
   *
   * @example
   * ```ts
   * await $mails.welcome.send({ to: user.email, name: user.name });
   * await $mails.welcome.send({ to: user.email, name: user.name }, { locale: "zh" });
   * ```
   */
  send(input: z.input<Schema>, options?: SendMailOptions): Promise<void>;
}

/**
 * Defines a mail: a Vue template rendered to HTML on the server.
 *
 * `defineMail` is auto-imported. One mail per file, under `server/mail/`;
 * the file is discovered, so nothing registers it, and its path is the
 * mail's name (`server/mail/order/shipped.mail.ts` is `"order.shipped"`).
 * Send it with {@link Mail.send} through the `$mails` namespace:
 * `$mails.order.shipped.send(input)`.
 *
 * `template` names a file under `server/mail/templates/` (or
 * `server/domains/<domain>/mail/templates/`) without `.vue`:
 * `"Welcome"` is `server/mail/templates/Welcome.vue`. The input without
 * `to` is its props, and a template whose props the input does not
 * satisfy fails to compile. `render` replaces `template` when the vnode
 * needs building by hand.
 *
 * Templates use the MJML components (`<EButton>`, `<EText>`, ...) and
 * {@link MailLayout} without importing them; they are registered for
 * mail templates only, and MJML attributes style them. The returned
 * mail's `render(input)` server-renders the template to MJML, converts
 * it to HTML with the Outlook fallbacks, and resolves to the HTML and a
 * plain-text version made from it. It throws when the template renders
 * invalid MJML, with the tag and the line of each error.
 *
 * A mail renders in one locale: the `locale` option of {@link Mail.send},
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
 * @param config.template The {@link MailTemplateName} the mail renders,
 * with the input without `to` as its props. The template does not get
 * the recipient, so the address does not show in the HTML as an attribute.
 * @param config.render In place of `template`: builds the vnode from the
 * input without `to`, for example `h(Template, props)`.
 * @param config.preview Optional. Returns the input that the DevTools
 * mail preview starts with. Without it, the preview starts with a sample
 * made from `input`.
 *
 * @example
 * ```ts
 * // server/mail/welcome.mail.ts
 * export const welcomeMail = defineMail({
 *   input: z.object({ to: z.email(), name: z.string() }),
 *   subject: ({ name }, { t }) => t("mail.welcome.subject", { name }),
 *   template: "Welcome",
 * });
 * ```
 */
export function defineMail<Schema extends MailSchema, const Preview extends z.input<Schema> = z.input<Schema>>(
  config: {
    input: Schema;
    subject: (input: z.infer<Schema>, i18n: MailI18n) => string;
    preview?: () => Preview;
  } & Body<Omit<z.infer<Schema>, "to">>,
): Mail<string, Schema> {
  const vnode = (props: Omit<z.infer<Schema>, "to">) => (config.render ? config.render(props) : templateVNode(config.template, props));
  const mail: Mail<string, Schema> = awaitingName(
    {
      name: "",
      input: config.input,
      subject: (input: z.infer<Schema>, locale = currentLocale()) => config.subject(input, { t: translator(locale), locale }),
      render: async ({ to: _to, ...props }: z.infer<Schema>, locale = currentLocale()) => renderEmail(vnode(props), translator(locale)),
      preview: config.preview,
      async send(input: z.input<Schema>, options?: SendMailOptions) {
        // a static import cycles through the #nuxvel/mails registry, which holds this mail
        const { sendMail } = await import("./send-mail");

        await sendMail(mail, input, options);
      },
    },
    "mail",
  );

  return mail;
}
