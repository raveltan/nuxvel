export default defineEventHandler((event) => {
  requireSignature(event);

  return getQuery(event);
});
