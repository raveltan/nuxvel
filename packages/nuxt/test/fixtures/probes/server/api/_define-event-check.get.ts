import { probeHappened } from "~~/server/events/_probe/happened";

export default defineEventHandler(async () => {
  const parsed = await probeHappened.parse({ name: "Hello", count: 3 });

  try {
    await probeHappened.parse({ name: "", count: "many" });
  } catch (error) {
    const fields = error instanceof ValidationFailedError ? error.fields : undefined;
    return { name: probeHappened.name, parsed, invalidThrew: true, fields };
  }

  return { name: probeHappened.name, parsed, invalidThrew: false, fields: {} };
});
