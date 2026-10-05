import { z } from "zod";

export const welcomeNotification = defineNotification({
  schema: z.object({ name: z.string().min(1) }),
  via: ["database", "mail", "push"],
  toDatabase: ({ name }) => ({
    title: `Welcome, ${name}`,
    body: "Thanks for signing up.",
    url: "/profile",
    icon: "i-lucide-party-popper",
  }),
  toMail: ({ name }) => ({ mail: "welcome", data: { name } }),
  toPush: ({ name }) => ({ title: `Welcome, ${name}`, body: "Thanks for signing up.", url: "/profile" }),
});
