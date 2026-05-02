import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./connection.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves the path to schema.sql. The file lives next to this module in
 * src/db/ but at runtime it ships uncompiled, so we resolve it relative to
 * the source tree first and fall back to the dist sibling location.
 */
function resolveSchemaPath(): string {
  // src/db at compile time → dist/db at runtime; schema.sql is not copied by
  // tsc, so we resolve it relative to the project root.
  // HERE is .../src/db or .../dist/db; in both cases ../../src/db/schema.sql
  // points to the source file.
  const candidates = [
    path.join(HERE, "schema.sql"),
    path.join(HERE, "..", "..", "src", "db", "schema.sql"),
  ];
  for (const c of candidates) {
    try {
      readFileSync(c, "utf8");
      return c;
    } catch {
      // try next
    }
  }
  throw new Error(
    `schema.sql not found. Tried: ${candidates.join(", ")}`,
  );
}

/** Applies the canonical schema. Idempotent — uses CREATE TABLE IF NOT EXISTS. */
export function applySchema(db: Db): void {
  const sql = readFileSync(resolveSchemaPath(), "utf8");
  db.exec(sql);
}
