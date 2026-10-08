import { defineUpload } from "@nuxvel/nuxt/server/storage";

export default defineUpload({
  maxSize: 4096,
  allowedTypes: ["image/png", "image/svg+xml"],
  public: true,
});
