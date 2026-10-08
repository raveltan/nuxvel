import { z } from "zod";
import { welcomeMail } from "#server/mail/welcome.mail";
import { defineNotification } from "@nuxvel/nuxt/server/notifications";

export const welcomeNotification = defineNotification({
  input: z.object({ name: z.string().min(1) }),
  via: ["database", "mail", "push"],
  message: ({ name }) => ({ title: `Welcome, ${name}`, body: "Thanks for signing up.", url: "/profile" }),
  toDatabase: ({ name }) => ({
    title: `Welcome, ${name}`,
    body: "Thanks for signing up.",
    url: "/profile",
    icon: "i-lucide-party-popper",
  }),
  toMail: ({ name }) => ({ mail: welcomeMail, input: { name } }),
});
