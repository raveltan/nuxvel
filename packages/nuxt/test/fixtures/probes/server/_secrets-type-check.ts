type IsAny<T> = 0 extends 1 & T ? true : false;

type Secrets = ReturnType<typeof useSecrets>;

export const secretsAreANonEmptyTuple: IsAny<Secrets> extends true
  ? never
  : [Secrets] extends [[string, ...string[]]]
    ? [[string, ...string[]]] extends [Secrets]
      ? true
      : never
    : never = true;

export const currentSecretIsAString: Secrets[0] extends string
  ? undefined extends Secrets[0]
    ? never
    : true
  : never = true;
