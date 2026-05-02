import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type Db } from "../src/db/connection.js";
import { applySchema } from "../src/db/migrations.js";
import { importIntoDb } from "../src/scripts/db-import.js";
import { loadLibrary } from "../src/laws/loader.js";
import { SqliteLegalRepository } from "../src/laws/sqlite-repository.js";
import { RAMAS, PRINCIPIOS } from "../src/db/seeds/intelligence.js";

const DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
);

describe("intelligence layer", () => {
  let db: Db;
  let repo: SqliteLegalRepository;

  beforeAll(async () => {
    db = openDb({ path: ":memory:" });
    applySchema(db);
    const lib = await loadLibrary({ dataDir: DATA_DIR });
    importIntoDb(db, [...lib.laws.values()]);
    repo = new SqliteLegalRepository(db);
  });

  it("seeds every rama declared in the seed file", () => {
    const ramas = repo.listRamas();
    expect(ramas).toHaveLength(RAMAS.length);
    const expectedIds = RAMAS.map((r) => r.id).sort();
    expect(ramas.map((r) => r.id).sort()).toEqual(expectedIds);
  });

  it("seeds every principio with its rama_id resolved", () => {
    let total = 0;
    for (const r of RAMAS) {
      const rama = repo.getRamaConContenido(r.id);
      expect(rama).toBeDefined();
      total += rama!.principios.length;
    }
    expect(total).toBe(PRINCIPIOS.length);
  });

  it("getRamaConContenido for derecho_civil returns principios + normas + doctrina", () => {
    const civil = repo.getRamaConContenido("derecho_civil");
    expect(civil).toBeDefined();
    expect(civil!.rama.nombre).toBe("Derecho Civil");
    expect(civil!.principios.length).toBeGreaterThanOrEqual(3);
    expect(civil!.principios.map((p) => p.id)).toContain("principio_buena_fe");
    expect(civil!.normas.map((n) => n.norma.id)).toContain("ccyc");
    expect(civil!.doctrina.length).toBeGreaterThan(0);
  });

  it("getRamaConContenido for derecho_penal includes the relevant normas", () => {
    const penal = repo.getRamaConContenido("derecho_penal");
    expect(penal).toBeDefined();
    const normaIds = penal!.normas.map((n) => n.norma.id);
    expect(normaIds).toContain("penal");
    expect(normaIds).toContain("constitucion");
  });

  it("getRamaConContenido for an unknown rama returns undefined", () => {
    expect(repo.getRamaConContenido("derecho_imaginario")).toBeUndefined();
  });

  it("getRamasDeNorma returns all branches of law a norma applies to", () => {
    // CCyC applies to civil, comercial and consumidor (the latter as complementaria)
    const ramas = repo.getRamasDeNorma("ccyc");
    const ramaIds = ramas.map((r) => r.rama.id);
    expect(ramaIds).toContain("derecho_civil");
    expect(ramaIds).toContain("derecho_comercial");
    expect(ramaIds).toContain("derecho_consumidor");
  });

  it("getRamasDeNorma for the constitucion includes constitucional + several public branches", () => {
    const ramas = repo.getRamasDeNorma("constitucion");
    const ramaIds = ramas.map((r) => r.rama.id);
    expect(ramaIds).toContain("derecho_constitucional");
    // Constitution is referenced by penal, administrativo, consumidor, datos as complementaria
    expect(ramaIds.length).toBeGreaterThan(1);
  });

  it("does NOT seed principios with rama_id pointing to a missing rama", () => {
    // Sanity: every seeded principio's rama_id must be in the ramas table.
    const ramaIds = new Set(repo.listRamas().map((r) => r.id));
    for (const p of PRINCIPIOS) {
      expect(ramaIds.has(p.rama_id), `principio ${p.id} references missing rama ${p.rama_id}`).toBe(true);
    }
  });

  it("declares norma_rama only for normas in the corpus", () => {
    const links = db
      .prepare(
        `SELECT nr.norma_id FROM norma_rama nr
         LEFT JOIN normas n ON n.id = nr.norma_id
         WHERE n.id IS NULL`,
      )
      .all();
    expect(links).toEqual([]);
  });

  it("leaves jurisprudencia table empty (curation pending)", () => {
    const civil = repo.getRamaConContenido("derecho_civil")!;
    expect(civil.jurisprudencia).toEqual([]);
  });
});
