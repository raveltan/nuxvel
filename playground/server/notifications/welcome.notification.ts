import { z } from "zod";

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
  toMail: ({ name }) => ({ mail: $mails.welcome, input: { name } }),
});
