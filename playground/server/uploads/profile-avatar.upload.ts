export const profileAvatarUpload = defineUpload({
  maxSize: 2 * 1024 * 1024,
  allowedTypes: ["image/png", "image/jpeg", "image/webp"],
  authorize: ({ user }) => user !== null,
});
