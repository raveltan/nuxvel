type IsAny<T> = 0 extends 1 & T ? true : false;

export const requestIdIsTyped = defineEventHandler((event) => {
  const typed: IsAny<typeof event.context.nuxvelRequestId> extends true ? never : true = true;

  return typed;
});
