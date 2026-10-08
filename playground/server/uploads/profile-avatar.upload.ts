import { defineUpload } from "@nuxvel/nuxt/server/storage";

export const profileAvatarUpload = defineUpload({
  maxSize: "2 MB",
  allowedTypes: ["image/png", "image/jpeg", "image/webp"],
});
