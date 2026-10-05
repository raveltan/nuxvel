/** A scripted answer for {@link fakeFetch}. `body` that is not a string is sent as JSON. */
export interface FakeResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** One outbound request the app sent while {@link fakeFetch} was on: its method, URL and body text. */
export interface FetchedRequest {
  method: string;
  url: string;
  body: string;
}

let responses: Record<string, FakeResponse> | undefined;

export function matchesUrl(pattern: string, url: string) {
  return pattern.endsWith("*") ? url.startsWith(pattern.slice(0, -1)) : url === pattern;
}

export function hasFakeResponse(url: string) {
  return Object.keys(responses ?? {}).some((key) => matchesUrl(key, url));
}

export function setFakeResponses(next: Record<string, FakeResponse> | undefined) {
  responses = next;
}

function scripted({ status = 200, body, headers = {} }: FakeResponse) {
  if (body === undefined || typeof body === "string") return new Response(body ?? null, { status, headers });

  return Response.json(body, { status, headers });
}

export function installFetchFake(fetched: FetchedRequest[]) {
  const realFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    if (!responses) return realFetch(input, init);

    const request = new Request(input, init);
    fetched.push({ method: request.method, url: request.url, body: await request.text() });
    const pattern = Object.keys(responses).find((key) => matchesUrl(key, request.url));

    if (!pattern) throw new Error(`fakeFetch: no fake response for ${request.method} ${request.url}`);

    return scripted(responses[pattern] ?? {});
  };

  return () => {
    globalThis.fetch = realFetch;
  };
}
