export default defineUpload({
  maxSize: 4096,
  allowedTypes: ["image/png", "image/svg+xml"],
  authorize: () => true,
});
