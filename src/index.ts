#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { buildServer } from "./server.js";
import { log, truncate } from "./log.js";

/**
 * Logs every inbound JSON-RPC message at the transport layer, before the SDK
 * dispatches it to a tool/resource/prompt handler. This is the only way to
 * see protocol-level traffic such as `initialize`, `notifications/initialized`,
 * `tools/list`, `ping`, etc. — none of which reach the tool handlers.
 *
 * Requests (have `id`) → log.verbose so they appear with ARGLEG_LOG_LEVEL=verbose.
 * Notifications (no `id`) → log.debug, since they are noisier and less actionable.
 * Params are dumped truncated only at debug level.
 */
function logRpcMessage(message: JSONRPCMessage): void {
  if (!("method" in message)) return; // outbound responses never appear here
  const method = (message as { method: string }).method;
  const isRequest = "id" in message && (message as { id?: unknown }).id !== undefined;
  const params = (message as { params?: unknown }).params;
  if (isRequest) {
    log.verbose("rpc.request", {
      method,
      id: (message as { id: string | number }).id,
      params:
        log.level === "debug" ? truncate(JSON.stringify(params ?? null), 300) : undefined,
    });
  } else {
    log.debug("rpc.notification", {
      method,
      params: truncate(JSON.stringify(params ?? null), 300),
    });
  }
}

async function main() {
  const server = await buildServer();
  const transport = new StdioServerTransport();
  // Install BEFORE connect(); the SDK's Protocol.connect() preserves any
  // pre-existing transport.onmessage and chains it as the first callback.
  transport.onmessage = logRpcMessage;
  await server.connect(transport);
  log.info("server.started", { transport: "stdio" });
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  log.error("server.fatal", { error: msg });
  process.exit(1);
});
