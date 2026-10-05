import { defineEventHandler, toWebRequest } from "h3";
import { clientIp } from "../security/client-ip";
import { authInstance } from "./instance";
import { CLIENT_IP_HEADER } from "./rate-limit";

export default defineEventHandler((event) => {
  const request = toWebRequest(event);
  const ip = clientIp(event);

  if (ip) request.headers.set(CLIENT_IP_HEADER, ip);
  else request.headers.delete(CLIENT_IP_HEADER);

  return authInstance().handler(request);
});
