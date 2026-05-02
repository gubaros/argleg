import Database from "better-sqlite3";
import path from "node:path";
import { homedir } from "node:os";

export type Db = Database.Database;

export interface OpenDbOptions {
  /** Path to the SQLite file. Use ":memory:" for an in-memory database. */
  path?: string;
  /** When true, the file must already exist. */
  readonly?: boolean;
}

/**
 * Resolves the default database path. Order of precedence:
 *   1. explicit `opts.path`
 *   2. ARGLEG_DB env var
 *   3. ~/Desktop/mcp/data/argleg.db
 */
export function resolveDbPath(opts: OpenDbOptions = {}): string {
  if (opts.path) return opts.path === ":memory:" ? ":memory:" : path.resolve(opts.path);
  const fromEnv = process.env.ARGLEG_DB;
  if (fromEnv && fromEnv.trim().length > 0) return path.resolve(fromEnv);
  return path.join(homedir(), "Desktop", "mcp", "data", "argleg.db");
}

/**
 * Opens a SQLite database with the pragmas argleg expects: foreign keys ON
 * and WAL journaling for concurrent readers (skipped for in-memory).
 */
export function openDb(opts: OpenDbOptions = {}): Db {
  const file = resolveDbPath(opts);
  const db = new Database(file, { readonly: opts.readonly ?? false });
  db.pragma("foreign_keys = ON");
  if (file !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  return db;
}
