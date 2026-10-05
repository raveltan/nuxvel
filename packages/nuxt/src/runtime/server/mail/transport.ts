import { useRuntimeConfig } from "nitropack/runtime";
import { type Transporter, createTransport } from "nodemailer";

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let transporter: Transporter | undefined;

function mailUrl() {
  const url = useRuntimeConfig().mailUrl;

  if (!url) throw new Error("NUXT_MAIL_URL is not set");

  return url;
}

export async function deliverMail(message: MailMessage) {
  transporter ??= createTransport(mailUrl());

  await transporter.sendMail(message);
}

export function closeMailTransport() {
  transporter?.close();
  transporter = undefined;
}
