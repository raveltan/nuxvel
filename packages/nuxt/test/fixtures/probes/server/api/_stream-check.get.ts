export default defineStreamHandler({
  authorize: () => true,
  handler: async (stream) => {
    for (const token of ["one", "two", "three"]) await stream.push({ event: "token", data: token });
  },
});
