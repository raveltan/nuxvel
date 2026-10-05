export default defineEventHandler(() => {
  console.log("console-check stray", { detail: 1 });
  process.emitWarning("console-check node warning", "ExperimentalWarning");
  throw new Error("console-check boom");
});
