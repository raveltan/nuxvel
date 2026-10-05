export default defineEventHandler(() => {
  const failure = new Error("cyclic cause failure");

  failure.cause = failure;
  useLogger("cyclic-cause-check").error("cyclic cause logged", failure);

  return { logged: true };
});
