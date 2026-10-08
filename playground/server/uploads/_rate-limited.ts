import { defineUpload } from "@nuxvel/nuxt/server/storage";

export default defineUpload({
  maxSize: 1024,
  allowedTypes: ["image/png"],
  rateLimit: { points: 2, window: { minutes: 1 }, by: "ip" },
  public: true,
});
