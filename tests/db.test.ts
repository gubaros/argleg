import { describe, it, expect } from "vitest";
import { openDb } from "../src/db/connection.js";
import { applySchema } from "../src/db/migrations.js";

describe("schema", () => {
  it("creates all canonical tables (corpus + intelligence layer)", () => {
    const db = openDb({ path: ":memory:" });
    applySchema(db);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    // Sorted alphabetically by SQLite — corpus and intelligence-layer tables interleave.
    expect(names).toEqual([
      "articulo_estructura",
      "articulos",
      "doctrina",
      "estructura_normativa",
      "jurisprudencia",
      "jurisprudencia_norma",
      "norma_rama",
      "normas",
      "principios_juridicos",
      "ramas_derecho",
      "relaciones_normativas",
    ]);
    db.close();
  });

  it("enables foreign key enforcement", () => {
    const db = openDb({ path: ":memory:" });
    applySchema(db);
    const fks = db.pragma("foreign_keys", { simple: true });
    expect(fks).toBe(1);
    db.close();
  });

  it("rejects an article with a non-existent norma_id", () => {
    const db = openDb({ path: ":memory:" });
    applySchema(db);
    expect(() =>
      db
        .prepare(
          `INSERT INTO articulos (id, norma_id, numero, texto, orden) VALUES (?, ?, ?, ?, ?)`,
        )
        .run("orphan", "no_existe", "1", "texto", 0),
    ).toThrow(/FOREIGN KEY/);
    db.close();
  });

  it("is idempotent on repeat application", () => {
    const db = openDb({ path: ":memory:" });
    applySchema(db);
    applySchema(db);
    applySchema(db);
    const tables = db
      .prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table'`)
      .get() as { c: number };
    expect(tables.c).toBe(11);
    db.close();
  });
});
