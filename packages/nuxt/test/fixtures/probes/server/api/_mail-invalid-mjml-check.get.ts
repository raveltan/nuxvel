import { h } from "vue";
import { z } from "zod";
import { defineMail } from "@nuxvel/nuxt/server/mail";

const looseTextMail = defineMail({
  input: z.object({ to: z.email() }),
  subject: () => "Loose text",
  render: () => h("mjml", null, [h("mj-body", null, [h("mj-text", null, "Loose text")])]),
});

export default defineEventHandler(() =>
  looseTextMail.render({ to: "ada@example.com" }).then(
    () => ({ message: null }),
    (error: Error) => ({ message: error.message }),
  ),
);
