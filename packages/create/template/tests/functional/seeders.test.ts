import { expectRow, runSeeder, signIn } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userTable } from "#nuxvel/schema";

describe("the database seeder", () => {
  it("creates a demo user who signs in with the printed password", async () => {
    await runSeeder("database");

    await expectRow(userTable, { email: "demo@example.com", name: "Demo User" });

    await signIn("demo@example.com", "demo-password");
  });
});
