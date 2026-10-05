import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<{ value: string }>();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default defineEventHandler(async () => {
  return storage.run({ value: "before-await" }, async () => {
    await delay(1);
    return { value: storage.getStore()?.value };
  });
});
