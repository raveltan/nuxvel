import { expectMailSent, renderMail } from "@nuxvel/nuxt/testing";

export async function rendersWhatWasSent() {
  const sent = await expectMailSent("welcome", { to: "ada@example.com" });

  await renderMail("welcome", sent);
}

export async function rendersWhatADefinitionSent() {
  const sent = await expectMailSent($mails.welcome);

  await renderMail($mails.welcome, sent);
}
