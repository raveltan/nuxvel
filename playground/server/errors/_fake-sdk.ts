export class FakeSdkError extends Error {
  override name = "FakeSdkError";

  constructor(readonly type: "duplicate_customer" | "server_error") {
    super(`Fake SDK failed: ${type}`);
  }
}

export default defineErrorClassifier((error) => {
  if (!(error instanceof FakeSdkError)) return undefined;
  if (error.type === "duplicate_customer") return new ConflictError("This customer already exists");

  return new TransientError("The fake SDK is briefly unavailable");
});
