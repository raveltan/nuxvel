import { healthCheckFactory } from "../../factories/health-checks.factory";
import { userFactory } from "../../factories/users.factory";

export default defineSeeder(async () => {
  await healthCheckFactory({ name: "seeded-before-author" });
  await userFactory({ name: "Seeded Author", email: "seeded-author@example.com" });
});
