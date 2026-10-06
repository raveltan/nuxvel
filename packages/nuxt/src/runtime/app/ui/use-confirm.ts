import { useOverlay } from "#imports";
import type { ConfirmOptions } from "./confirm-options";
import ConfirmDialog from "./ConfirmDialog.vue";

export type { ConfirmOptions } from "./confirm-options";

/**
 * Returns a `confirm(options)` function. It opens a Nuxt UI modal and
 * resolves to `true` when the user confirms, or `false` when the user
 * cancels.
 *
 * Auto-imported unless the app sets `nuxvel.ui: false`. Call it inside
 * `setup()` and keep `<UApp>` in `app.vue`. Escape, the Cancel button
 * and a click outside the dialog cancel. Focus goes back to the element
 * that had it before the dialog opened.
 *
 * @example
 * ```ts
 * const confirm = useConfirm();
 *
 * async function remove(post: Post) {
 *   const confirmed = await confirm({
 *     title: "Delete post?",
 *     description: `"${post.title}" will be deleted.`,
 *     confirmLabel: "Delete",
 *     color: "error",
 *   });
 *   if (confirmed) deletePost({ id: post.id });
 * }
 * ```
 */
export function useConfirm() {
  const overlay = useOverlay();

  return async (options: ConfirmOptions) => {
    const dialog = overlay.create(ConfirmDialog, { destroyOnClose: true });

    return (await dialog.open(options)) === true;
  };
}
