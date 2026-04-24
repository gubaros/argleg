#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";
import { log } from "./log.js";

async function main() {
  const server = await buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("server.started", { transport: "stdio" });
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  log.error("server.fatal", { error: msg });
  process.exit(1);
});
