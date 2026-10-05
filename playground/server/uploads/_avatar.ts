export default defineUpload({
  maxSize: 1024,
  allowedTypes: ["image/png", "image/jpeg"],
  authorize: () => true,
});
