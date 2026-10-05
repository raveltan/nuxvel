export function describeDatabaseUrl(databaseUrl: string, fallback: string) {
  try {
    const url = new URL(databaseUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return fallback;
  }
}
