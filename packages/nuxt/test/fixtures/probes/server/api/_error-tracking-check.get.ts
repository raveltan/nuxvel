export default defineEventHandler(() => {
  throw new Error("handler exploded");
});
