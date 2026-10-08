import { z } from "zod";
import _updateMail from "#server/mail/_update.mail";
import { defineNotification } from "@nuxvel/nuxt/server/notifications";

export default defineNotification({
  input: z.object({ name: z.string().min(1) }),
  via: ["database", "mail", "push"],
  message: ({ name }) => ({ title: `Hello, ${name}`, body: "One message for every channel.", url: "/profile" }),
  mail: _updateMail,
});
