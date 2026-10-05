import { z } from "zod";

const echo = probeNamed("_system-actor-check.echo", defineAction({
  input: z.object({ value: z.string() }),
  handler: (input) => input,
}));

export default defineEventHandler(async () => {
  const actor = systemActor("cli");
  const withActor = await echo({ value: "ok" }, { actor });

  let threwWithoutActor = false;
  try {
    await Reflect.apply(echo, undefined, [{ value: "ok" }]);
  } catch {
    threwWithoutActor = true;
  }

  return { withActor, threwWithoutActor, actor };
});
