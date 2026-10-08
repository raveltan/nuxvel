import { healthCheckFactory } from "#nuxvel/factories";
import { userFactory } from "#nuxvel/factories";
import { defineSeeder } from "@nuxvel/nuxt/server/database";

export default defineSeeder(async () => {
  await healthCheckFactory({ name: "seeded-before-author" });
  await userFactory({ name: "Seeded Author", email: "seeded-author@example.com" });

  return ["Seeded Author is seeded-author@example.com"];
});
