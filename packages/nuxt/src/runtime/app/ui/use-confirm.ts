import type { ButtonProps, ModalProps } from "@nuxt/ui";
import { useOverlay } from "#imports";
import ConfirmDialog from "./ConfirmDialog.vue";

/** What the dialog of a {@link useConfirm} call shows. */
export interface ConfirmOptions {
  /** The dialog title, for example `"Delete post?"`. */
  title: string;
  /** The text under the title. */
  description?: string;
  /** The label of the confirm button. The default is `"Confirm"`, in the current locale. */
  confirmLabel?: string;
  /** The label of the cancel button. The default is `"Cancel"`, in the current locale. */
  cancelLabel?: string;
  /** The Nuxt UI colour of the confirm button, such as `"error"`. The default is `"primary"`. */
  color?: ButtonProps["color"];
  /** Classes for the slots of the dialog's `UModal` (`content`, `footer`, ...), as its `ui` prop. */
  ui?: ModalProps["ui"];
}

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
