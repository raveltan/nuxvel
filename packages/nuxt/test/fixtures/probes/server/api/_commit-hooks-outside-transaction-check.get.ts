import { beforeCommit, onCommit } from "@nuxvel/nuxt/server/database";

function slowly(ran: string[], name: string) {
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    ran.push(name);
  };
}

export default defineEventHandler(async () => {
  const ran: string[] = [];

  await beforeCommit(slowly(ran, "beforeCommit"));
  await onCommit(slowly(ran, "onCommit"));

  return { ran };
});
