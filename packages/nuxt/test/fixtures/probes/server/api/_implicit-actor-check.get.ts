import { createPostAsCaller } from "~~/server/actions/_probes/create-post-as-caller";

async function errorOf(run: () => Promise<unknown>) {
  try {
    await run();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export default defineEventHandler(async () => ({
  error: await errorOf(() => createPostAsCaller({ title: "No actor", body: "Nobody" })),
  auditError: await errorOf(() => audit("post.checked", { id: 1 })),
}));
