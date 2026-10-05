import { useToast } from "#imports";
import { FLASH_COOKIE } from "../../shared/flash/flash-message";

/**
 * Adds a Nuxt UI success toast to a mutation's options. The toast shows
 * each time the mutation succeeds.
 *
 * Auto-imported unless the app sets `nuxvel.ui: false`. Call it inside
 * `setup()`, since it reads `useToast()`, and keep `<UApp>` in `app.vue`.
 * It wraps any options `useMutation()` takes, so it composes with
 * {@link optimistic} and {@link useActionForm}. A failure shows no
 * toast: show it on the page, where it stays until the user acts.
 * The toast replaces a {@link flash} message of the mutation, so the
 * next page does not show that message again.
 *
 * @param mutationOptions - Usually `useTRPC().<path>.mutationOptions()`.
 * @param title - The toast title, or a function of the mutation's result.
 *
 * @example
 * ```ts
 * const trpc = useTRPC();
 * const form = useActionForm(
 *   updatePostInput,
 *   toasted(trpc.post.update.mutationOptions(), "Post saved"),
 *   { defaults: { id: post.id, title: post.title, body: post.body } },
 * );
 * ```
 */
export function toasted<
  TVars,
  TResult,
  TOptions extends { mutation: (vars: TVars) => Promise<TResult> },
>(
  mutationOptions: TOptions & { mutation: (vars: TVars) => Promise<TResult> },
  title: string | ((result: TResult) => string),
) {
  const toast = useToast();

  return {
    ...mutationOptions,
    async mutation(vars: TVars) {
      const result = await mutationOptions.mutation(vars);
      document.cookie = `${FLASH_COOKIE}=; path=/; max-age=0; samesite=lax`;
      toast.add({ title: typeof title === "function" ? title(result) : title, color: "success" });
      return result;
    },
  };
}
