import { useRuntimeConfig } from "nitropack/runtime";
import { z } from "zod";
import mails from "#nuxvel/mails";
import { defineDevtoolsSection } from "../define-devtools-section";
import { readableSchema } from "../readable-schema";
import { sampleInput } from "../sample-input";
import type { MailSectionData } from "../../../shared/devtools/sections/mail";
import { errorMessage } from "../../errors/error-message";

const RECENT_LIMIT = 20;
const MAILPIT_TIMEOUT_MS = 2000;

const address = z.object({ Name: z.string(), Address: z.string() });

const mailpitMessages = z.object({
  total: z.number(),
  messages: z.array(
    z.object({
      ID: z.string(),
      From: address.nullable(),
      To: z.array(address).nullable(),
      Subject: z.string(),
      Created: z.string(),
      Snippet: z.string(),
    }),
  ),
});

let previews: { name: string; sample: unknown }[] | undefined;

async function sentMail(mailpitUrl: string) {
  const response = await fetch(new URL(`/api/v1/messages?limit=${RECENT_LIMIT}`, mailpitUrl), {
    signal: AbortSignal.timeout(MAILPIT_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Mailpit answered ${response.status}`);

  const { total, messages } = mailpitMessages.parse(await response.json());

  return {
    total,
    messages: messages.map((message) => ({
      id: message.ID,
      subject: message.Subject,
      from: message.From?.Address ?? "",
      to: (message.To ?? []).map((recipient) => recipient.Address),
      sentAt: message.Created,
      snippet: message.Snippet,
      url: new URL(`/view/${message.ID}`, mailpitUrl).toString(),
    })),
  };
}

function discoveredPreviews() {
  previews ??= mails
    .map((mail) => ({ name: mail.name, sample: mail.preview?.() ?? sampleInput(readableSchema(mail.input)) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return previews;
}

export default defineDevtoolsSection<MailSectionData>({
  id: "mail",
  title: "Mail",
  order: 35,
  load: async () => {
    const mailpitUrl = useRuntimeConfig().mailpitUrl;
    const sent = await sentMail(mailpitUrl).then(
      (result) => ({ ...result, error: null }),
      (error: unknown) => ({ total: 0, messages: [], error: errorMessage(error) }),
    );

    return { mailpitUrl, sent, previews: discoveredPreviews() };
  },
});
