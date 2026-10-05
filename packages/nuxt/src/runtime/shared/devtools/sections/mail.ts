export type SentMail = {
  id: string;
  subject: string;
  from: string;
  to: string[];
  sentAt: string;
  snippet: string;
  url: string;
};

export type MailSectionData = {
  mailpitUrl: string;
  sent: { total: number; messages: SentMail[]; error: string | null };
  previews: { name: string; sample: unknown }[];
};
