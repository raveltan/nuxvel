import type { ButtonProps, ModalProps } from "@nuxt/ui";

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
