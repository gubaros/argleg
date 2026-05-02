#!/usr/bin/env node
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { openDb, resolveDbPath } from "../db/connection.js";
import { applySchema } from "../db/migrations.js";

interface Args {
  db?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    const v = argv[i + 1];
    if (k === "--db") {
      a.db = v;
      i++;
    } else if (k === "-h" || k === "--help") {
      process.stderr.write(
        "Uso: npm run db:init -- [--db <path>]\n" +
          "  Crea la base SQLite y aplica el schema (idempotente).\n",
      );
      process.exit(0);
    } else {
      process.stderr.write(`[db-init] Opción desconocida: ${k}\n`);
      process.exit(2);
    }
  }
  return a;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = resolveDbPath({ path: args.db });
  if (dbPath !== ":memory:") {
    await mkdir(path.dirname(dbPath), { recursive: true });
  }
  const db = openDb({ path: dbPath });
  applySchema(db);
  db.close();
  process.stderr.write(`[db-init] Schema aplicado en ${dbPath}\n`);
}

import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[db-init] ${msg}\n`);
    process.exit(1);
  });
}
