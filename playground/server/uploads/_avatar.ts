import { defineUpload } from "@nuxvel/nuxt/server/storage";

export default defineUpload({
  maxSize: "1 KB",
  allowedTypes: ["image/png", "image/jpeg"],
  public: true,
});
