/**
 * Logger for argleg-mcp.
 *
 * IMPORTANT: STDOUT is reserved for the MCP JSON-RPC transport when the
 * server is attached over stdio; writing anything else there would corrupt
 * the protocol stream.
 *
 * Logs always go to STDERR and, optionally, to a file via ARGLEG_LOG_FILE.
 *
 * Control level via env var ARGLEG_LOG_LEVEL: silent | info | verbose | debug
 * Default: info.
 *
 * Also honours ARGLEG_LOG_JSON=1 to emit one JSON object per line
 * (easier to pipe into log aggregators).
 */

import { appendFileSync } from "node:fs";

export type LogLevel = "silent" | "info" | "verbose" | "debug";

const LEVEL_RANK: Record<LogLevel, number> = {
  silent: 0,
  info: 1,
  verbose: 2,
  debug: 3,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.ARGLEG_LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "silent" || raw === "info" || raw === "verbose" || raw === "debug") {
    return raw;
  }
  return "info";
}

const LEVEL: LogLevel = resolveLevel();
const JSON_MODE = process.env.ARGLEG_LOG_JSON === "1";
const LOG_FILE = process.env.ARGLEG_LOG_FILE?.trim() || "";

/**
 * Identity of the connected MCP client, populated from the `clientInfo` field
 * of the `initialize` JSON-RPC handshake. Auto-merged into every log line so
 * tool/resource calls can be attributed to a specific client (Claude Desktop,
 * Claude Code, Cursor, etc.). The stdio transport is 1:1 client↔process, so
 * a module-level slot is safe.
 */
export interface ClientInfo {
  name?: string;
  version?: string;
}
let CLIENT_INFO: ClientInfo | undefined;

export function setClientInfo(info: ClientInfo): void {
  CLIENT_INFO = info;
}

export function getClientInfo(): ClientInfo | undefined {
  return CLIENT_INFO;
}

function withClient(fields: Record<string, unknown>): Record<string, unknown> {
  if (!CLIENT_INFO) return fields;
  // Skip the tag if both name and version are absent — avoids printing `client={}`.
  if (CLIENT_INFO.name === undefined && CLIENT_INFO.version === undefined) return fields;
  return { client: CLIENT_INFO, ...fields };
}

function enabled(at: LogLevel): boolean {
  return LEVEL_RANK[at] <= LEVEL_RANK[LEVEL];
}

function writeLine(line: string): void {
  process.stderr.write(line);
  if (!LOG_FILE) return;
  try {
    appendFileSync(LOG_FILE, line, "utf8");
  } catch {
    // Avoid recursive logging if the log file itself fails.
  }
}

function emit(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  if (!enabled(level)) return;
  const ts = new Date().toISOString();
  const merged = withClient(fields);
  if (JSON_MODE) {
    const line = JSON.stringify({ ts, level, event, ...merged }) + "\n";
    writeLine(line);
    return;
  }
  const pairs = Object.entries(merged)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${fmt(v)}`)
    .join(" ");
  writeLine(`[argleg-mcp ${ts} ${level.padEnd(7)}] ${event}${pairs ? " " + pairs : ""}\n`);
}

function fmt(v: unknown): string {
  if (typeof v === "string") {
    // Keep short inline; quote if it has spaces or special chars.
    if (v.length <= 80 && !/[\s"=]/.test(v)) return v;
    return JSON.stringify(v);
  }
  if (v instanceof Error) return JSON.stringify({ message: v.message });
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const log = {
  level: LEVEL,
  info(event: string, fields?: Record<string, unknown>) {
    emit("info", event, fields);
  },
  verbose(event: string, fields?: Record<string, unknown>) {
    emit("verbose", event, fields);
  },
  debug(event: string, fields?: Record<string, unknown>) {
    emit("debug", event, fields);
  },
  error(event: string, fields?: Record<string, unknown>) {
    // Errors are always shown unless silent.
    if (LEVEL === "silent") return;
    const ts = new Date().toISOString();
    const merged = withClient(fields ?? {});
    if (JSON_MODE) {
      writeLine(JSON.stringify({ ts, level: "error", event, ...merged }) + "\n");
      return;
    }
    const pairs = Object.entries(merged)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${fmt(v)}`)
      .join(" ");
    writeLine(`[argleg-mcp ${ts} error  ] ${event}${pairs ? " " + pairs : ""}\n`);
  },
};

/** Truncate a string to at most n chars with ellipsis for log output. */
export function truncate(s: string, n = 200): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `…(+${s.length - n} chars)`;
}

/** Best-effort size of a tool/resource/prompt result payload. */
export function resultSize(result: unknown): number {
  try {
    return JSON.stringify(result).length;
  } catch {
    return -1;
  }
}
