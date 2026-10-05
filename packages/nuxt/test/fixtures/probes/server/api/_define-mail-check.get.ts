import { welcomeMail } from "~~/server/mail/welcome.mail";

export default defineEventHandler(() => welcomeMail.render({ to: "ada@example.com", name: "Ada" }));
