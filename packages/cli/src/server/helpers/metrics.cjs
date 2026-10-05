#!/usr/bin/node
const { readFile } = require("node:fs/promises");
const { createServer } = require("node:http");

createServer(async (request, response) => {
  if (request.url !== "/metrics") {
    response.statusCode = 404;
    response.end("Not found\n");
    return;
  }
  try {
    const metrics = await readFile("/var/lib/nuxvel-metrics/metrics.prom", "utf8");
    response.setHeader("content-type", "text/plain; version=0.0.4");
    response.end(metrics);
  } catch {
    response.statusCode = 503;
    response.end("The monitor has written no metrics yet\n");
  }
}).listen(9470, "127.0.0.1");
