import { parse } from "node:url";

const PUSH_SERVICE_HOST =
  /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/;

export function isPushServiceEndpoint(endpoint: string) {
  if (!URL.canParse(endpoint)) return false;

  const url = new URL(endpoint);

  // web-push connects to the host of the legacy url.parse(), which reads some strings differently from new URL()
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    PUSH_SERVICE_HOST.test(url.hostname) &&
    parse(endpoint).hostname === url.hostname
  );
}
