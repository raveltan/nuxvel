import { z } from "zod";
import { defineJob } from "../../jobs/define-job";
import { deliverMail } from "../transport";

export default defineJob({
  queue: "mail",
  input: z.object({
    from: z.string(),
    to: z.string(),
    subject: z.string(),
    html: z.string(),
    text: z.string().optional(),
  }),
  async handler(message) {
    await deliverMail(message);
  },
});
