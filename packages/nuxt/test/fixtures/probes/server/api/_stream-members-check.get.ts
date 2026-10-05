export default defineStreamHandler({
  authorize: ({ user }) => user !== null,
  handler: () => {},
});
