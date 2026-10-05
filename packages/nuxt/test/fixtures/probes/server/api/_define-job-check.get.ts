import { z } from "zod";

const seen: unknown[] = [];

const echo = probeNamed("_define-job-check.echo", defineJob({
  input: z.object({ title: z.string().min(3), views: z.number().min(0) }),
  handler: (input) => {
    seen.push(input);
  },
}));

const unregistered = defineJob({ version: 3, input: z.object({}), handler: () => {} });

function nameError() {
  try {
    return String(unregistered.name);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export default defineEventHandler(async () => {
  seen.length = 0;
  const unnamed = {
    spreadKeys: Object.keys({ ...unregistered }),
    json: JSON.parse(JSON.stringify(unregistered)),
    nameError: nameError(),
    registeredSpreadName: { ...echo }.name,
  };
  await echo.run({ version: 1, payload: { title: "Hello", views: 3 } });

  try {
    await echo.run({ version: 1, payload: { title: "no", views: -1 } });
    return { seen, unnamed, invalidThrew: false };
  } catch (error) {
    return { seen, unnamed, invalidThrew: true, fields: error instanceof ValidationFailedError ? error.fields : undefined };
  }
});
