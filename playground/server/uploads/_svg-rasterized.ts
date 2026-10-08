import { defineUpload } from "@nuxvel/nuxt/server/storage";

export default defineUpload({
  maxSize: 1024 * 1024,
  allowedTypes: ["image/svg+xml"],
  svg: "rasterize",
  public: true,
});
