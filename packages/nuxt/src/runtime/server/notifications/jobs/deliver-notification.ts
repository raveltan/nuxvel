import { inArray } from "drizzle-orm";
import { z } from "zod";
import { useDb } from "../../database/client";
import { schemaTable } from "../../database/schema-table";
import { defineJob } from "../../jobs/define-job";
import type { MailInput, MailName } from "../../mail/registry";
import { sendMail } from "../../mail/send-mail";
import { mailLocale } from "../../auth/mail-locale";

export default defineJob({
  queue: "mail",
  input: z.object({
    userIds: z.array(z.string()),
    mail: z.object({ mail: z.string(), data: z.record(z.string(), z.unknown()) }),
  }),
  async handler({ userIds, mail }) {
    const user = schemaTable("user");
    const recipients = await useDb()
      .select({ email: user.email, locale: user.locale })
      .from(user)
      .where(inArray(user.id, userIds));

    for (const recipient of recipients) {
      // toMail typed this mail and its input when notify() built it; the queue carries them as plain JSON
      await sendMail(mail.mail as MailName, { ...mail.data, to: recipient.email } as MailInput<MailName>, { locale: mailLocale(recipient) });
    }
  },
});
