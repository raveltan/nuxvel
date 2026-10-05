import postgres from "postgres";

export function ownerConnection(entry: string) {
  const url = process.env.NUXT_DATABASE_OWNER_URL || process.env.NUXT_DATABASE_URL;

  if (!url) {
    console.error(`nuxvel ${entry}: set NUXT_DATABASE_OWNER_URL to the connection string of the owner role`);
    process.exit(1);
  }

  return postgres(url, { max: 1, onnotice: () => {} });
}
