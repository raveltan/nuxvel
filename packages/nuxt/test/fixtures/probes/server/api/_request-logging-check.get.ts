export default defineEventHandler(async () => {
  const lines: string[] = [];
  const write = process.stdout.write;

  process.stdout.write = (chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  };

  try {
    await $fetch("/api/_db-check?token=query-secret", {
      headers: { "x-request-id": "request-logging-request-id" },
    });
    await $fetch("/api/auth/reset-password/path-secret?callbackURL=/", {
      redirect: "manual",
      headers: { "x-request-id": "request-logging-reset" },
    }).catch(() => undefined);
  } finally {
    process.stdout.write = write;
  }

  return { lines };
});
