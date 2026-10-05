import { createPostAsCaller } from "~~/server/actions/_probes/create-post-as-caller";

export default defineEventHandler(async () => {
  try {
    await createPostAsCaller({ title: "No actor", body: "Nobody" });
    return { error: undefined };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
});
