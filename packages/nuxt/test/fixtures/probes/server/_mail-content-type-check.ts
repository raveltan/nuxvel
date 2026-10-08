import { expectMailSent, renderMail } from "@nuxvel/nuxt/testing";
import { welcomeMail } from "#server/mail/welcome.mail";

export async function rendersWhatWasSent() {
  const sent = await expectMailSent("welcome", { to: "ada@example.com" });

  await renderMail("welcome", sent);
}

export async function rendersWhatADefinitionSent() {
  const sent = await expectMailSent(welcomeMail);

  await renderMail(welcomeMail, sent);
}
