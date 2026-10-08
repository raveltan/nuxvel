import { addComponent, addComponentsDir, addPlugin } from "@nuxt/kit";
import type { ResolvedOptions, RuntimeFile } from "./resolved-options";
import { addUiLocale } from "./ui-locale";

export function addComponents(options: ResolvedOptions, runtimeFile: RuntimeFile) {
  if (options.ui) {
    addUiLocale();
    addComponent({ name: "SocialSignIn", filePath: runtimeFile("./runtime/app/ui/SocialSignIn.vue") });
    addPlugin(runtimeFile("./runtime/app/ui/flash-toasts.client"));
    addPlugin(runtimeFile("./runtime/app/ui/mutation-ui"));
    addComponent({ name: "DataTable", filePath: runtimeFile("./runtime/app/ui/DataTable.vue") });
    addComponent({ name: "SearchInput", filePath: runtimeFile("./runtime/app/ui/SearchInput.vue") });
    addComponent({ name: "UploadField", filePath: runtimeFile("./runtime/app/ui/UploadField.vue") });
    addComponent({ name: "ActionForm", filePath: runtimeFile("./runtime/app/ui/ActionForm.vue") });
    addComponent({ name: "ActionField", filePath: runtimeFile("./runtime/app/ui/ActionField.vue") });
    addComponent({ name: "AuthForm", filePath: runtimeFile("./runtime/app/ui/AuthForm.vue") });
    addComponent({ name: "PresenceAvatars", filePath: runtimeFile("./runtime/app/ui/PresenceAvatars.vue") });
    addComponent({ name: "TypingIndicator", filePath: runtimeFile("./runtime/app/ui/TypingIndicator.vue") });
    addComponent({
      name: "MaintenanceBanner",
      filePath: runtimeFile("./runtime/app/maintenance/MaintenanceBanner.vue"),
    });
    addComponent({ name: "NotificationBell", filePath: runtimeFile("./runtime/app/ui/NotificationBell.vue") });
  }

  addComponentsDir({
    path: runtimeFile("./runtime/app/components"),
    ignore: ["**/*.stories.*"],
  });

  addComponent({
    name: "QueryState",
    filePath: runtimeFile(
      options.ui
        ? "./runtime/app/query-state/UiQueryState.vue"
        : "./runtime/app/query-state/QueryState.vue",
    ),
  });
}
