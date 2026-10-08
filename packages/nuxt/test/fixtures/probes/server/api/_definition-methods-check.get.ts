import { z } from "zod";
import { subscribeObserved } from "../../../../../src/runtime/server/observe/channels";
import _probePublicChannel from "#server/channels/_probe-public";
import { probeQueued } from "#server/events/_probe/queued";
import recordJob from "#server/jobs/_probe/record";
import { welcomeMail } from "#server/mail/welcome.mail";
import { welcomeNotification } from "#server/notifications/welcome.notification";
import { transaction } from "@nuxvel/nuxt/server/database";

const query = z.object({ userId: z.string() });

async function callEachKind(userId: string, label: string) {
  await recordJob.dispatch({ name: label });
  await _probePublicChannel.broadcast("renamed", { id: 1 });
  await welcomeMail.send({ to: `${label}@nuxvel.test`, name: "Ada" });
  await probeQueued.emit({ name: label });
  await welcomeNotification.notify(userId, { name: "Ada" });
}

export default defineEventHandler(async (event) => {
  const { userId } = query.parse(getQuery(event));
  const seen: string[] = [];
  const unsubscribe = [
    subscribeObserved("job:dispatch", ({ name }) => {
      if (name === "_probe.record") seen.push("job");
      if (name === "listener:_record-probe-queued") seen.push("event");
    }),
    subscribeObserved("realtime:broadcast", ({ channel }) => {
      if (channel === "_probe-public") seen.push("channel");
    }),
    subscribeObserved("mail:send", ({ name }) => {
      if (name === "welcome") seen.push("mail");
    }),
    subscribeObserved("notification:send", ({ name }) => {
      if (name === "welcome") seen.push("notification");
    }),
  ];

  try {
    await transaction(async () => {
      await callEachKind(userId, "rolled-back");
      throw new Error("probe rollback");
    }).catch(() => undefined);

    const afterRollback = [...seen];
    let beforeCommit: string[] = [];

    await transaction(async () => {
      await callEachKind(userId, "committed");
      beforeCommit = [...seen];
    });

    const afterCommit = [...seen];
    seen.length = 0;
    await callEachKind(userId, "outside");

    return { afterRollback, beforeCommit, afterCommit, outside: [...seen] };
  } finally {
    for (const stop of unsubscribe) stop();
  }
});
