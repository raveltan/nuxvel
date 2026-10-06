import { userFactory } from "#nuxvel/factories";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password";

export const databaseSeeder = defineSeeder(async () => {
  await userFactory.withPassword(DEMO_PASSWORD)({ name: "Demo User", email: DEMO_EMAIL, emailVerified: true });
  await userFactory.count(3)();

  return [`Sign in as ${DEMO_EMAIL} with the password ${DEMO_PASSWORD}`];
});
