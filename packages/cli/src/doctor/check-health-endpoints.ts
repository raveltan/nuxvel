import { type UrlDoctorCheck, failed, passed } from "./doctor-check.ts";
import { errorMessage } from "../error-message.ts";

const paths = ["/api/health/live", "/api/health/ready"];

export const checkHealthEndpoints: UrlDoctorCheck = {
  name: "health endpoints",
  async run({ url }) {
    const problems: string[] = [];

    for (const path of paths) {
      const endpoint = new URL(path, url).toString();

      try {
        const response = await fetch(endpoint);
        if (!response.ok) problems.push(`${endpoint} returned ${response.status}`);
      } catch (error) {
        problems.push(`${endpoint} is unreachable: ${errorMessage(error)}`);
      }
    }

    if (problems.length === 0) return [passed(`${paths.join(" and ")} answer`)];

    return problems.map(
      (problem, index) =>
        failed(problem, index === problems.length - 1 ? "/api/health/ready fails while the database or Redis is down" : undefined),
    );
  },
};
