import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { openDb, resolveDbPath } from "../src/db/connection.js";
import { SqliteLegalRepository } from "../src/laws/sqlite-repository.js";

// Performance microbenchmark for searchArticles. Disabled by default; opt in
// with `RUN_PERF=1 npm test`. Operates against the real on-disk DB so the
// pragmas (mmap, cache_size) and FTS index reflect production behaviour.
const enabled = process.env.RUN_PERF === "1";
const dbPath = resolveDbPath();
const dbReady = existsSync(dbPath);

describe.runIf(enabled && dbReady)("perf: searchArticles", () => {
  const QUERIES = [
    "habeas data",
    "consumidor",
    "homicidio culposo",
    "responsabilidad civil",
    "domicilio",
    "1",
  ];
  const ITER = 100;

  it(`median latency under 30ms across ${ITER} calls`, () => {
    const repo = new SqliteLegalRepository(openDb({ readonly: true }));
    // Warm up the cache to avoid measuring cold I/O.
    for (const q of QUERIES) repo.searchArticles(q);

    const ts: number[] = [];
    for (let i = 0; i < ITER; i++) {
      const q = QUERIES[i % QUERIES.length]!;
      const t = performance.now();
      repo.searchArticles(q);
      ts.push(performance.now() - t);
    }
    repo.close();
    ts.sort((a, b) => a - b);
    const median = ts[Math.floor(ts.length / 2)]!;
    const p95 = ts[Math.floor(ts.length * 0.95)]!;
    process.stderr.write(
      `[perf] searchArticles median=${median.toFixed(2)}ms p95=${p95.toFixed(2)}ms\n`,
    );
    expect(median).toBeLessThan(30);
  });
});
