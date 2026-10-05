export default defineUpload({
  maxSize: 1024 * 1024,
  allowedTypes: ["image/svg+xml"],
  svg: "rasterize",
  authorize: () => true,
});
