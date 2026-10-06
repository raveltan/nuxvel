/** What every call of `authClient` resolves with: its data, or Better Auth's error. */
export interface AuthResult<T> {
  data: T | null;
  error: { message?: string | undefined; code?: string | undefined; status?: number } | null;
}

/**
 * Returns the data of an `authClient` call, or throws an `Error` when
 * Better Auth refused it.
 *
 * Auto-imported. The message of the error is Better Auth's message, or
 * `fallback` when it gives none, and its `cause` is Better Auth's error with its `code` and
 * `status`. {@link useSessions}, {@link useChangeEmail},
 * {@link useTwoFactor} and {@link useResendVerification} throw the same
 * error; use this for any other `authClient` call, such as in the
 * `mutation` of a `useMutation()`.
 *
 * @param fallback The message when Better Auth gives none, already
 * translated: read it with `ts()` in `setup`, not after an `await`.
 *
 * @example
 * ```ts
 * const updateName = useMutation({
 *   mutation: async (name: string) => unwrapAuth(await authClient.updateUser({ name }), "Could not save your name"),
 * });
 * ```
 */
export function unwrapAuth<T>(result: AuthResult<T>, fallback: string): T {
  if (result.error || result.data === null) {
    throw new Error(result.error?.message || fallback, { cause: result.error });
  }

  return result.data;
}
