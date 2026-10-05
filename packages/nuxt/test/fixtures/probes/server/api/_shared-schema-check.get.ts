export default defineEventHandler(() => {
  const valid = healthCheckIdInput.safeParse({ id: 1 });
  const invalid = healthCheckIdInput.safeParse({ id: "not-a-number" });

  return {
    validSucceeded: valid.success,
    invalidError: invalid.success ? null : toValidationError(invalid.error),
  };
});
