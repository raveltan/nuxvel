import { type TestContext, useTestContext } from "@nuxt/test-utils/e2e";
import superjson, { type SuperJSONResult } from "superjson";
import { TEST_CONTROL_PATH } from "../runtime/server/testing/control-path";

let rememberedContext: TestContext | undefined;

function activeContext() {
  try {
    return useTestContext();
  } catch {
    return undefined;
  }
}

function serverUrl() {
  const url = (activeContext() ?? rememberedContext)?.url;

  return url && URL.canParse(url) ? url : undefined;
}

export function rememberTestServer() {
  rememberedContext = activeContext() ?? rememberedContext;
}

export async function postToControlChannel(name: string) {
  const url = serverUrl();

  if (!url) return;

  const response = await fetch(new URL(`${TEST_CONTROL_PATH}/${name}`, url), {
    method: "POST",
  });

  if (response.status === 404) return;

  if (!response.ok) {
    throw new Error(`POST ${TEST_CONTROL_PATH}/${name} answered ${response.status}`);
  }
}

function requireServerUrl() {
  const url = serverUrl();

  if (!url) {
    throw new Error('nuxvel testing: the app is not running. List "@nuxvel/nuxt/testing/global-setup" in vitest\'s globalSetup and "@nuxvel/nuxt/testing/setup" in setupFiles');
  }

  return url;
}

async function answer<Body>(name: string, response: Response): Promise<Body> {
  if (!response.ok) {
    throw new Error(`${TEST_CONTROL_PATH}/${name} answered ${response.status}: ${await response.text()}`);
  }

  const body: SuperJSONResult = await response.json();

  return superjson.deserialize<Body>(body);
}

export async function readControlChannel<Body>(name: string): Promise<Body> {
  const response = await fetch(new URL(`${TEST_CONTROL_PATH}/${name}`, requireServerUrl()));

  return answer<Body>(name, response);
}

export async function callControlChannel<Body>(name: string, input: unknown, headers?: HeadersInit): Promise<Body> {
  const sent = new Headers(headers);

  sent.set("content-type", "application/json");

  const response = await fetch(new URL(`${TEST_CONTROL_PATH}/${name}`, requireServerUrl()), {
    method: "POST",
    headers: sent,
    body: JSON.stringify(superjson.serialize(input)),
  });

  return answer<Body>(name, response);
}
