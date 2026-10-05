import dns from "node:dns";

if (process.env.NUXVEL_TEST_DNS_SERVER) dns.setServers([process.env.NUXVEL_TEST_DNS_SERVER]);
