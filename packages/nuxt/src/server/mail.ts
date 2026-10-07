export { defineMailWebhook } from "../../runtime/server/mail/define-mail-webhook";
export { defineMail } from "../../runtime/server/mail/define-mail";
export type { MailWebhookProvider } from "../../runtime/server/mail/define-mail-webhook";
export type { Mail, MailI18n, MailSchema, MailTemplateName, MailTemplateProps, RenderedMail } from "../../runtime/server/mail/define-mail";
export type { MailInput, MailName } from "../../runtime/server/mail/registry";
export { sendMailNow } from "../../runtime/server/mail/send-mail-now";
export type { SendMailOptions } from "../../runtime/server/mail/send-mail";
export { isMailSuppressed, suppressMail } from "../../runtime/server/mail/suppress-mail";
export type { MailSuppressionReason } from "../../runtime/server/mail/suppress-mail";
