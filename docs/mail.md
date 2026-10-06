# Mail

## Introduction

nuxvel sends mail through SMTP. You write each mail as a Vue component. The server renders it to [MJML](https://mjml.io), and MJML changes it to HTML that email clients show correctly. `$mails.<name>.send()` queues the mail after the surrounding transaction commits, and `nuxvel queue:work` delivers it. Use mail for messages to a person, such as a notice to subscribers when a new post goes live.

## Configuration

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: {
    mail: { from: "My Blog <hello@example.com>" },
  },
});
```

```
NUXT_MAIL_URL=smtp://localhost:1025
```

| Setting | Use |
|---|---|
| `nuxvel.mail.from` | The sender address of every mail. `send()` throws when it is not set. |
| `NUXT_MAIL_URL` | The SMTP server that delivers the mail. |
| `NUXT_MAILPIT_URL` | The Mailpit web address that the [DevTools](./devtools.md#mail) mail panel reads. Dev server only. The default is `http://localhost:8025`. |

`NUXT_MAIL_URL` has no default. When it is not set, the delivery job fails with `NUXT_MAIL_URL is not set`. In production, a server does not start without it, because the [auth mails](./auth.md#email-verification) need it.

The links in the mails start with `NUXT_SITE_URL`. `nuxvel dev` sets it to the app URL that it prints. A value in the shell or in `.env` wins. Without a full URL the delivery job fails with `Invalid URL`.

Before you send from a real domain, run `nuxvel doctor`. Its `mail dns` row checks that the domain of `nuxvel.mail.from` has SPF, DKIM and DMARC records. See [CLI: nuxvel doctor](./cli.md#nuxvel-doctor).

### Mailpit in development

`docker compose up -d` starts [Mailpit](https://mailpit.axllent.org). Mailpit accepts SMTP on `localhost:1025` and keeps every message it gets. Open <http://localhost:8025> to read them. The nuxvel [DevTools](./devtools.md#mail) tab lists the latest messages and previews each mail with sample input.

## Defining a mail

```vue
<!-- server/mail/post/templates/PostPublished.vue -->
<script setup lang="ts">
defineProps<{ title: string; url: string }>();
</script>

<template>
  <MailLayout :preview="`New post: ${title}`">
    <EHeading>New post: {{ title }}</EHeading>
    <EText>A new post is live on the blog.</EText>
    <EButton :href="url" background-color="#4f46e5">Read the post</EButton>
  </MailLayout>
</template>
```

```ts
// server/mail/post/published.mail.ts
import { h } from "vue";
import { z } from "zod";
import PostPublished from "./templates/PostPublished.vue";

export const postPublishedMail = defineMail({
  input: z.object({ to: z.email(), title: z.string(), url: z.url() }),
  subject: ({ title }) => `New post: ${title}`,
  render: (props) => h(PostPublished, props),
});
```

Put one mail in each file under `server/mail/`. Keep its Vue templates next to it. nuxvel finds the file. You do not register it.

The path of the file is the name of the mail. The file above is `post.published`, and `server/mail/welcome.mail.ts` is `welcome`. A name may only hold `a-z`, `0-9`, `.`, `_` and `-`.

The auto-imported `$mails` namespace holds each mail under its path. Each path segment is in camelCase and has no kind suffix. `$mails.post.published` is the mail in the file above. Go to definition on `$mails.post.published` opens the mail file. `$mails` is available on the server only.

`defineMail()` takes these options:

| Option | Use |
|---|---|
| `input` | A Zod schema for the data the mail needs. Its `to` field is the recipient. |
| `subject` | Makes the subject line from the input. The second argument has `t` and `locale`. See [Mail in a locale](#mail-in-a-locale). |
| `render` | Makes the template's vnode from the input without `to`, usually `h(Template, props)`. The template does not get the recipient, so the address does not show in the HTML as an attribute. |
| `preview` | Optional. Returns the input that the [DevTools](./devtools.md#previewing-a-mail) preview starts with. TypeScript checks it against the schema. A value such as `"identified"` keeps its literal type, so an enum field does not need `as const`. |

### Components

A mail template uses the MJML components. Many email clients do not show a normal `<div>` layout correctly. Each `E` component renders one MJML tag. When the mail renders, MJML changes the tags to HTML tables with inline styles. The HTML also has fallbacks for Outlook on desktop: tables in conditional comments (`<!--[if mso]>`) and VML buttons. Columns stack on a phone.

| Component | MJML tag | Renders |
|---|---|---|
| `<MailLayout>` | | The page: a white card with the site name at the top and a footer. |
| `<EHtml>`, `<EHead>`, `<EBody>` | `mjml`, `mj-head`, `mj-body` | The document. `<MailLayout>` renders them for you. |
| `<EPreview>` | `mj-preview` | The hidden line that the inbox shows after the subject. It goes in `<EHead>`. With `<MailLayout>`, use its `preview` prop. |
| `<EContainer>` | `mj-wrapper` | A box around sections with one background and border. |
| `<ESection>` | `mj-section` | A row of the layout. |
| `<ERow>` | `mj-group` | Columns that stay side by side on a phone. |
| `<EColumn>` | `mj-column` | A column of a section. Columns stack on a phone. |
| `<EText>` | `mj-text` | A paragraph. It can hold HTML, for example `<ELink>`. |
| `<EHeading>` | `mj-text` | A heading: an `<h1>` at 24px, bold. Set the level with `as="h2"`. |
| `<EButton>` | `mj-button` | A link that looks like a button. |
| `<EImg>` | `mj-image` | An image. |
| `<EHr>` | `mj-divider` | A horizontal line. |
| `<ELink>` | `<a>` | A plain link. Put it in an `<EText>`. |

You do not import these components. nuxvel registers them for the Vue files under `server/mail/` only. They are not components of your app, and your app pages cannot use them.

MJML accepts a tag only in some parents. For example, `<EText>` must be in an `<EColumn>`, and `<EColumn>` must be in an `<ESection>`. When a template breaks a rule, `render()` and `send()` throw. The error shows the MJML tag, the line of the rendered MJML and the rule, for example `line 3, <mj-text>: mj-text cannot be used inside mj-body, only inside: mj-attributes, mj-column, mj-hero`.

`<MailLayout>` shows `nuxvel.seo.siteName` as the site name. When [SEO](./seo.md) is not configured, it shows the display name of `nuxvel.mail.from`. For `My Blog <hello@example.com>`, the name is `My Blog`. When the address has no display name, the layout shows its domain.

The slot of `<MailLayout>` is the content of one column. Put `<EHeading>`, `<EText>`, `<EButton>`, `<EImg>` and `<EHr>` in it, not `<ESection>`. The `preview` prop sets the hidden preview line.

A template can leave out `<MailLayout>`. Then it must render `<EHtml>`, `<EHead>` and `<EBody>` itself, with sections and columns in the body:

```vue
<template>
  <EHtml>
    <EHead><EPreview>Your invoice is ready.</EPreview></EHead>
    <EBody background-color="#f3f4f6">
      <ESection background-color="#ffffff">
        <EColumn>
          <EText font-size="16px">Your invoice is ready.</EText>
        </EColumn>
      </ESection>
    </EBody>
  </EHtml>
</template>
```

### Styling

Set styles with MJML attributes on the components, not with classes or a `<style>` block:

```vue
<EText font-size="14px" color="#6b7280">If you did not ask for this, ignore this mail.</EText>
<EButton :href="url" background-color="#4f46e5" border-radius="6px">Open</EButton>
```

MJML writes each attribute as an inline style, because some email clients ignore `<style>` tags and classes. Each component accepts the attributes of its MJML tag. The [MJML documentation](https://documentation.mjml.io) lists them. Write each value as a string, with `px` sizes and hex colors. Tailwind classes have no effect in a mail.

`<MailLayout>` sets default attributes for its content: a system font, 16px text in dark gray, and a dark button. An attribute on a component replaces the default.

Vue escapes the values that you write with `{{ }}`, and the HTML of the sent mail keeps them escaped. A `<` in a value shows as text. It does not become markup.

### Text version

Each mail has a plain-text version. nuxvel makes it from the HTML and sends it with the HTML. A mail client that cannot show HTML shows the text version. You do not write it.

### Previewing a mail

```ts
// server/mail/post/published.mail.ts
export const postPublishedMail = defineMail({
  input: z.object({ to: z.email(), title: z.string(), url: z.url() }),
  subject: ({ title }) => `New post: ${title}`,
  render: (props) => h(PostPublished, props),
  preview: () => ({
    to: "ada@example.com",
    title: "Hello",
    url: "https://blog.example.com/posts/hello",
  }),
});
```

Run `nuxvel dev` and open the nuxvel tab of Nuxt DevTools. The **Mail** section renders each mail in a frame and sends nothing. The input starts as the value that `preview` returns. When a mail has no `preview`, the input starts as a sample made from its schema. See [DevTools](./devtools.md#previewing-a-mail).

The preview exists on the dev server only. A production build does not have it.

### Generating a mail

```bash
nuxvel make:mail post.published
```

The command writes three files: the mail `postPublishedMail` at `server/mail/post/published.mail.ts`, its template at `server/mail/post/templates/PostPublished.vue`, and a functional test at `server/mail/post/published.mail.test.ts`. The template has a heading, a paragraph, a button and a link in `<MailLayout>`, styled with MJML attributes. The test renders the mail and checks its HTML, its Outlook markup and its text. See the [CLI reference](./cli.md#generators).

### Rendering a mail

```ts
// server/api/preview.get.ts
import { postPublishedMail } from "#server/mail/post/published.mail";

const { html, text } = await postPublishedMail.render({
  to: "ada@example.com",
  title: "Hello",
  url: "https://blog.example.com/posts/hello",
});
```

Import the mail from its file. `render(input)` renders the template on the server. It resolves to `html`, the HTML that MJML made, and `text`, the plain-text version. It sends nothing. `render(input, locale)` renders the template in that locale. See [Mail in a locale](#mail-in-a-locale).

## Sending a mail

```ts
await transaction(async () => {
  const post = await publishPostAction({ id: postId }, { actor });

  await $mails.post.published.send({
    to: subscriber.email,
    title: post.title,
    url: `https://blog.example.com/posts/${post.id}`,
  });
});
```

`$mails.<name>.send(input)` does these steps. `$mails` holds every mail of `server/mail/`, keyed by its path in camelCase, and is auto-imported on the server:

1. It validates `input` against the schema of the mail. Async refinements and transforms also run.
2. It renders the HTML and the text version of the mail.
3. It dispatches the rendered message as a `nuxvel.mail` job, which waits for the commit like any [dispatch](./queues.md#dispatching).

The request does not send the mail. The job goes through the outbox to the `mail` queue, and `nuxvel queue:work` delivers it through `NUXT_MAIL_URL`. When the transaction rolls back, nothing is sent. A worker started with `--queue` delivers mail only when the list has `mail`. See [Named queues](./queues.md#named-queues).

`input` has the input type of the mail's schema, so a wrong input fails `nuxt typecheck`. Go to definition on `published` opens the mail file.

Invalid input throws `ValidationFailedError`, the same error a failed action throws. See [Validation](./validation.md).

### Sending a mail now

```ts
await sendMailNow($mails.welcome, { to: user.email, name: user.name });
```

`sendMailNow(mail, input)` sends the mail through `NUXT_MAIL_URL` before it returns. It does not use the queue or the outbox. It validates, renders and checks [suppressed addresses](#suppressed-addresses) like `send()`.

Use it only when the code must know that the mail went out before it continues. It is the exception:

- It does not wait for the transaction. A rollback after the send does not take the mail back.
- The request waits for the SMTP server.
- When the SMTP server refuses the mail, `sendMailNow()` throws. Nothing retries it.

A listener with `sync: true` cannot call `sendMailNow()`. `nuxvel test:arch` flags it. See [the CLI](./cli.md#nuxvel-testarch).

## Mail in a locale

A mail renders in one locale. Give the locale code to `send()` or `sendMailNow()`:

```ts
await $mails.welcome.send({ to: user.email, name: user.name }, { locale: "zh" });
```

Without the `locale` option, the mail renders in the locale that [`currentLocale()`](./i18n.md#the-locale-on-the-server) returns: the locale of the request or the action. A job and a schedule have no request, so there the mail renders in the default locale. Give the locale of the recipient when you know it.

The template translates with `$t(key, params)`. The `subject` gets `t` and `locale` in its second argument:

`locales/zh.json`:

```json
{
  "mail": {
    "welcome": { "subject": "欢迎，{name}", "heading": "欢迎，{name}！" }
  }
}
```

```vue
<!-- server/mail/templates/Welcome.vue -->
<script setup lang="ts">
defineProps<{ name: string }>();
</script>

<template>
  <MailLayout>
    <EHeading>{{ $t("mail.welcome.heading", { name }) }}</EHeading>
  </MailLayout>
</template>
```

```ts
// server/mail/welcome.mail.ts
export const welcomeMail = defineMail({
  input: z.object({ to: z.email(), name: z.string() }),
  subject: ({ name }, { t }) => t("mail.welcome.subject", { name }),
  render: (props) => h(Welcome, props),
});
```

`$t` and `t` read the global translation files (`locales/<code>.json`) of the app and of each layer. They do not read the page files. `{name}` in a text is replaced by the `name` param. Vue escapes the text of `$t` like each other value in `{{ }}`. When the locale does not have a key, the text comes from the default locale, then from `en`. A locale that the app does not have renders with the default locale. A key that no file has renders as the key.

A mail template has only `$t` of the i18n helpers. `<MailLayout>` translates its footer with the key `nuxvel.mail.sentBy`.

### The auth mails

The [auth mails](./auth.md#email-verification) have English (`en`) and Chinese (`zh`) text. Each other locale gets the English text. To change a text, put its key in a translation file of the app. The app key wins:

`locales/zh.json`:

```json
{
  "nuxvel": {
    "auth": {
      "verifyEmail": { "subject": "请确认您在 My Blog 的电子邮件地址" }
    }
  }
}
```

| Mail | Keys under `nuxvel.auth.` |
|---|---|
| Verify email | `verifyEmail.subject`, `.preview`, `.heading`, `.body`, `.button`, `.ignore` |
| Reset password | `resetPassword.subject`, `.preview`, `.heading`, `.body` (`{name}`), `.button`, `.ignore` |
| Security notice | `securityNotice.subject`, `.heading`, `.greeting` (`{name}`), `.password`, `.email`, `.emailApproval`, `.new-sign-in`, `.two-factor-on`, `.two-factor-off`, `.device` (`{device}`), `.button`, `.notYou`, `.notYouApproval` |
| Existing account | `existingAccount.subject`, `.preview`, `.heading`, `.body`, `.signIn`, `.ignore` |

The auth mails render in the locale of the request that sends them.

## Suppressed addresses

```ts
await suppressMail(recipient, "bounce");
```

Do not send mail again to an address that bounced or complained. Call `suppressMail(address, reason)` from the code that receives bounce and complaint events from your mail provider. The reason is `"bounce"` or `"complaint"`. When you record an address two times, the first record stays. `suppressMail()` joins the active transaction.

After that, `send()` to the address does not render or queue anything. It logs a `mail` line with the name of the mail and the domain of the recipient. The log line never shows the full address.

```ts
if (await isMailSuppressed(subscriber.email)) {
  await markInactive(subscriber);
}
```

`isMailSuppressed(address)` tells you if the address is on the list. Both functions compare addresses without case and ignore spaces at the start and end.

### Bounce webhooks

```ts
// server/webhooks/mail/resend.webhook.ts
export const mailResendWebhook = defineMailWebhook("resend");
```

For Resend and Mailgun, nuxvel has a ready webhook that fills the list. Put `defineMailWebhook(provider)` in a file under `server/webhooks/`. It is auto-imported. The file above answers at `POST /api/webhooks/mail.resend`. Give this URL to the provider, and send the bounce and complaint events to it.

The webhook checks the signature of the provider. It puts each bounced or complaining address on the list with `suppressMail()`. A temporary bounce does not suppress the address. The webhook acknowledges all other events and does nothing with them.

| Provider | Suppresses | Secret |
|---|---|---|
| `"resend"` | `email.bounced`, except a `Transient` bounce, and `email.complained` | `NUXT_RESEND_WEBHOOK_SECRET`, the `whsec_...` signing secret |
| `"mailgun"` | `failed` with `severity: "permanent"`, and `complained` | `NUXT_MAILGUN_WEBHOOK_SIGNING_KEY` |

For other providers, write a [webhook](./webhooks.md) that calls `suppressMail()`.

### The suppression table

The list is the `mail_suppressions` table. A new app defines it in `server/database/schema/mail-suppressions.schema.ts`:

```ts
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { MailSuppressionReason } from "@nuxvel/nuxt/database";
import { now } from "@nuxvel/nuxt/database";

export const mailSuppressionsTable = pgTable("mail_suppressions", {
  id: serial("id").primaryKey(),
  address: text("address").notNull().unique(),
  reason: text("reason").$type<MailSuppressionReason>().notNull(),
  suppressedAt: timestamp("suppressed_at").notNull().defaultNow().$defaultFn(now),
});
```

nuxvel has no function that removes an address from the list. To send to the address again, delete its row from `mail_suppressions`.

## Testing

```ts
import { expect, expectMailSent, renderMail, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postFactory, subscriberFactory, userFactory } from "#nuxvel/factories";

describe("post.published mail", () => {
  it("goes to subscribers when a post is published", async () => {
    const author = await userFactory();
    const post = await postFactory({ author });
    const subscriber = await subscriberFactory();

    await runAction("posts.publish-post", { id: post.id }, { actingAs: author });

    await expectMailSent("post.published", { to: subscriber.email, title: post.title });
  });

  it("renders the title and the link", async () => {
    const { subject, text } = await renderMail("post.published", {
      to: "ada@example.com",
      title: "Hello",
      url: "https://blog.example.com/posts/hello",
    });

    expect(subject).toBe("New post: Hello");
    expect(text).toContain("Read the post https://blog.example.com/posts/hello");
  });
});
```

A functional test never connects to the SMTP server. The `nuxvel.mail` job delivers the mail, and no functional test runs that job.

| Fixture | Use |
|---|---|
| `expectMailSent(name, match?)` | Fails unless the mail was sent with input that contains the `match` fields. Returns the input of the latest matching send. |
| `expectNoMailSent(name, match?)` | Fails when the mail was sent with input that contains the `match` fields. Without `match`, fails on any send of the mail. |
| `renderMail(name, input, options?)` | Renders the mail in the app. It resolves to its `subject`, `html` and `text`, and sends nothing. `options.locale` sets the locale. The default is the default locale. |

A send is recorded after its transaction commits. A rolled-back send records nothing. A send to a suppressed address records nothing.

`renderMail()` validates `input` first and rejects with a `BAD_REQUEST` validation error, as `send()` does. All three fixtures come from `@nuxvel/nuxt/testing`. See [Testing](./testing.md).

Each fixture also takes a mail definition or its name stub in place of the name. A test file imports the stubs from `#nuxvel/test-namespaces`.

```ts
import { $mails } from "#nuxvel/test-namespaces";

await expectMailSent($mails.post.published, { to: subscriber.email });
```

To follow a link in a mail, read it from the input that `expectMailSent()` returns:

```ts
const { url } = await expectMailSent("password-reset", { to: user.email });
```

`renderMail()` accepts the same input. To check the content of the mail that code sent, render it:

```ts
const sent = await expectMailSent("post.published", { to: subscriber.email });
const { subject, text } = await renderMail("post.published", sent);
```

## See also

- [Queues](./queues.md)
- [Webhooks](./webhooks.md)
- [Database](./database.md#after-the-commit)
- [Validation](./validation.md)
- [DevTools](./devtools.md#mail)
- [Testing](./testing.md)
- [Notifications](./notifications.md)
