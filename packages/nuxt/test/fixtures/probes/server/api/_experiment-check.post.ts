export default defineEventHandler(async (event) => {
  const { running } = await readBody<{ running: boolean }>(event);

  if (running) await startExperiment("probe-cta");
  else await stopExperiment("probe-cta");

  return { ok: true };
});
