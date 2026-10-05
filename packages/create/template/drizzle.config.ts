import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./server/database/schema/**/*.ts",
    "./server/domains/*/schema/**/*.schema.ts",
    "./layers/*/server/database/schema/**/*.ts",
    "./layers/*/server/domains/*/schema/**/*.schema.ts",
  ],
  out: "./server/database/migrations",
  dialect: "postgresql",
});
