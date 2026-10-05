import ConfirmDialog from "./ConfirmDialog.vue";

export default { title: "ConfirmDialog", component: ConfirmDialog };

export const Default = { args: { open: true, title: "Delete post?", description: "\"Hello world\" will be deleted.", confirmLabel: "Delete", color: "error" } };
