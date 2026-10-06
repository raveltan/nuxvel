import { z } from "zod";
import { renderMail } from "../../../../../src/runtime/server/mail/render-mail";

const available = async (value: string) => value !== "taken";

const seen: unknown[] = [];

const job = probeNamed("_async-refine-check.job", defineJob({
  input: z.object({ title: z.string().refine(available, { message: "That title is taken" }) }),
  handler: (input) => {
    seen.push(input);
  },
}));

const happened = probeNamed("_async-refine-check.happened", defineEvent({
  payload: z.object({ title: z.string().refine(available, { message: "That title is taken" }) }),
}));

async function fieldsOfRejection(run: () => Promise<unknown>) {
  try {
    await run();
    return undefined;
  } catch (error) {
    return error instanceof ValidationFailedError ? error.fields : String(error);
  }
}

export default defineEventHandler(async () => {
  seen.length = 0;
  await job.run({ version: 1, payload: { title: "free" } });
  await happened.emit({ title: "free" });
  await $channels._probePublic.broadcast("checked", { title: "accepted" });

  return {
    job: {
      seen,
      rejected: await fieldsOfRejection(() => job.run({ version: 1, payload: { title: "taken" } })),
    },
    event: {
      parsed: await happened.parse({ title: "free" }),
      rejected: await fieldsOfRejection(() => happened.emit({ title: "taken" })),
    },
    mail: {
      subject: (await renderMail("_probe-checked", { to: "ada@example.com", name: "Ada" })).subject,
      rejected: await fieldsOfRejection(() => $mails._probeChecked.send({ to: "ada@example.com", name: "taken" })),
    },
    broadcast: {
      rejected: await fieldsOfRejection(() => $channels._probePublic.broadcast("checked", { title: "rejected" })),
    },
  };
});
