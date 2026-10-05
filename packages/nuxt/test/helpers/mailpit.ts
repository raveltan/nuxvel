import { TEST_MAILPIT_URL } from "@nuxvel/test-helpers/services";

type MailpitMessage = { ID: string; Subject: string; To: { Address: string }[] };

export async function mailpitMessagesTo(address: string) {
  const url = new URL("/api/v1/search", TEST_MAILPIT_URL);
  url.searchParams.set("query", `to:"${address}"`);

  const response = await fetch(url);
  const body = (await response.json()) as { messages: MailpitMessage[] };

  return body.messages;
}

export async function mailpitHtmlSupport(id: string) {
  const response = await fetch(new URL(`/api/v1/message/${id}/html-check`, TEST_MAILPIT_URL));
  const body = (await response.json()) as { Total: { Supported: number } };

  return body.Total.Supported;
}

export async function mailpitText(id: string) {
  const response = await fetch(new URL(`/api/v1/message/${id}`, TEST_MAILPIT_URL));
  const body = (await response.json()) as { Text: string };

  return body.Text;
}
