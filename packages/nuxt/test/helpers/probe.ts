import { guest } from "@nuxvel/nuxt/testing";
import { beforeAll } from "vitest";

export function runProbeOnce<Body = any>(path: string) {
  let body: Body | undefined;

  beforeAll(async () => {
    body = await guest().$fetch<Body>(path);
  });

  return () => {
    if (body === undefined) throw new Error(`${path} has not answered yet`);
    return body;
  };
}
