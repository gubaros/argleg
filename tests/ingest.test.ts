import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/db/connection.js";
import { applySchema } from "../src/db/migrations.js";
import { importIntoDb } from "../src/scripts/db-import.js";
import { loadLibrary } from "../src/laws/loader.js";
import { SqliteLegalRepository } from "../src/laws/sqlite-repository.js";

const DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
);

describe("JSON → SQLite ingestion", () => {
  let db: ReturnType<typeof openDb>;
  let repo: SqliteLegalRepository;
  let totals: { norma: number; articulos: number; nodos: number };

  beforeAll(async () => {
    db = openDb({ path: ":memory:" });
    applySchema(db);
    const lib = await loadLibrary({ dataDir: DATA_DIR });
    expect(lib.errors).toHaveLength(0);
    const result = importIntoDb(db, [...lib.laws.values()]);
    expect(result.fatalErrors).toEqual([]);
    totals = result.totals;
    repo = new SqliteLegalRepository(db);
  });

  it("inserts every norma found in the JSON corpus", () => {
    expect(totals.norma).toBe(9);
    const norms = repo.listNorms();
    expect(norms.map((n) => n.id).sort()).toEqual([
      "ccyc",
      "constitucion",
      "cpccn",
      "cppf",
      "ley_19549",
      "ley_19550",
      "ley_24240",
      "ley_25326",
      "penal",
    ]);
  });

  it("inserts a meaningful number of articles (>4500)", () => {
    expect(totals.articulos).toBeGreaterThan(4500);
  });

  it("leaves no orphan articles (every articulo.norma_id resolves)", () => {
    const orphans = db
      .prepare(
        `SELECT a.id FROM articulos a
         LEFT JOIN normas n ON n.id = a.norma_id
         WHERE n.id IS NULL`,
      )
      .all() as Array<{ id: string }>;
    expect(orphans).toEqual([]);
  });

  it("leaves no dangling articulo_estructura links", () => {
    const dangling = db
      .prepare(
        `SELECT ae.articulo_id FROM articulo_estructura ae
         LEFT JOIN articulos a ON a.id = ae.articulo_id
         LEFT JOIN estructura_normativa e ON e.id = ae.estructura_id
         WHERE a.id IS NULL OR e.id IS NULL`,
      )
      .all();
    expect(dangling).toEqual([]);
  });

  it("ingests ley_25326 with all 48 articles", () => {
    const meta = repo.getNormMetadata("ley_25326");
    expect(meta).toBeDefined();
    expect(meta!.resumen_estructural.cantidad_articulos).toBe(48);
  });

  it("ingests ccyc with full structural depth", () => {
    const meta = repo.getNormMetadata("ccyc");
    expect(meta).toBeDefined();
    expect(meta!.resumen_estructural.tiene_libros).toBe(true);
    expect(meta!.resumen_estructural.tiene_capitulos).toBe(true);
    expect(meta!.resumen_estructural.cantidad_articulos).toBeGreaterThan(2000);
  });

  it("getArticle on ley_25326 art 1 returns the expected text", () => {
    const result = repo.getArticle("ley_25326", "1");
    expect(result).toBeDefined();
    expect(result!.articulo.numero).toBe("1");
    expect(result!.articulo.texto).toContain("protección integral de los datos personales");
  });

  it("searchArticles finds 'habeas data' in ley_25326", () => {
    const hits = repo.searchArticles("habeas data", { limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
    const fromLpdp = hits.filter((h) => h.norma_id === "ley_25326");
    expect(fromLpdp.length).toBeGreaterThan(0);
  });
});
