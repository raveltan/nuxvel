import { inArray } from "drizzle-orm";
import { z } from "zod";
import { useDb } from "../../database/client";
import { schemaTable } from "../../database/schema-table";
import { defineJob } from "../../jobs/define-job";
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
      await sendMail(mail.mail, { ...mail.data, to: recipient.email }, { locale: mailLocale(recipient) });
    }
  },
});
