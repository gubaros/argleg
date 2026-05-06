import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type Db } from "../src/db/connection.js";
import { applySchema } from "../src/db/migrations.js";
import { importIntoDb } from "../src/scripts/db-import.js";
import { loadLibrary } from "../src/laws/loader.js";
import { SqliteLegalRepository } from "../src/laws/sqlite-repository.js";

const DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
);

describe("structural recovery (bug #1 + tech debt #3)", () => {
  let db: Db;
  let repo: SqliteLegalRepository;

  beforeAll(async () => {
    db = openDb({ path: ":memory:" });
    applySchema(db);
    const lib = await loadLibrary({ dataDir: DATA_DIR });
    importIntoDb(db, [...lib.laws.values()]);
    repo = new SqliteLegalRepository(db);
  });

  describe("bug #1 — trailing structural headers stripped from article text", () => {
    const samples: Array<{ norma: string; numero: string; mustNotContain: string[] }> = [
      { norma: "constitucion", numero: "35", mustNotContain: ["CAPÍTULO SEGUNDO", "CAPITULO SEGUNDO"] },
      { norma: "constitucion", numero: "43", mustNotContain: ["SEGUNDA PARTE", "TITULO PRIMERO", "DEL PODER LEGISLATIVO"] },
      { norma: "constitucion", numero: "86", mustNotContain: ["DEL PODER EJECUTIVO", "CAPÍTULO PRIMERO"] },
      { norma: "constitucion", numero: "120", mustNotContain: ["DISPOSICIONES TRANSITORIAS"] },
    ];

    for (const s of samples) {
      it(`${s.norma} art ${s.numero} should not have structural-header leakage`, () => {
        const result = repo.getArticle(s.norma, s.numero);
        expect(result).toBeDefined();
        for (const phrase of s.mustNotContain) {
          expect(result!.articulo.texto).not.toContain(phrase);
        }
      });
    }

    it("CN art 43 ends cleanly at '...estado de sitio.'", () => {
      const result = repo.getArticle("constitucion", "43");
      expect(result!.articulo.texto.trimEnd().endsWith("estado de sitio.")).toBe(true);
    });
  });

  describe("tech debt #3 — structural hierarchy recovered for the CN", () => {
    it("constitucion now has structural nodes", () => {
      const meta = repo.getNormMetadata("constitucion");
      expect(meta).toBeDefined();
      expect(meta!.resumen_estructural.cantidad_articulos).toBe(130);
      // We expect at least 'capitulo', 'parte', 'titulo' levels recovered
      expect(meta!.resumen_estructural.tiene_capitulos).toBe(true);
    });

    it("CN art 36 hangs under 'Capítulo Segundo — Nuevos derechos y garantías'", () => {
      const result = repo.getArticle("constitucion", "36");
      expect(result).toBeDefined();
      const ctx = result!.contexto_estructural;
      const cap = ctx.find((n) => n.tipo === "capitulo");
      expect(cap).toBeDefined();
      expect(cap!.nombre.toLowerCase()).toContain("nuevos derechos");
    });

    it("CN art 44 hangs under the 'Segunda Parte' branch", () => {
      const result = repo.getArticle("constitucion", "44");
      expect(result).toBeDefined();
      // Walk ancestors via the structure node returned + manual lookup
      const direct = result!.contexto_estructural;
      // The leaf may be Título / Sección — verify the chain mentions Segunda Parte by walking parent_ids in the DB.
      const allNodes = repo.getNormStructure("constitucion");
      const byId = new Map(allNodes.map((n) => [n.id, n]));
      const ancestors: string[] = [];
      let current = direct[0];
      while (current) {
        ancestors.push(current.nombre);
        if (!current.parent_id) break;
        current = byId.get(current.parent_id);
      }
      expect(ancestors.some((a) => a.toLowerCase().includes("segunda parte"))).toBe(true);
    });
  });

  describe("bug #2 — CN Primera Parte missing from structure (smoke-test report #2)", () => {
    it("constitucion has a 'Primera Parte' root structural node", () => {
      const nodes = repo.getNormStructure("constitucion");
      const primera = nodes.find((n) => n.tipo === "parte" && /primera/i.test(n.nombre ?? ""));
      expect(primera).toBeDefined();
      expect(primera!.parent_id).toBeNull();
    });

    it("CN art 1 is structurally under Primera Parte", () => {
      const result = repo.getArticle("constitucion", "1");
      expect(result).toBeDefined();
      expect(
        result!.contexto_estructural.some(
          (n) => n.tipo === "parte" && /primera/i.test(n.nombre ?? ""),
        ),
      ).toBe(true);
    });

    it("Primera Parte contains 36 articles (arts. 1–14bis–35, the dogmatic core)", () => {
      // The CN's First Part (Declaraciones, Derechos y Garantías) has 36
      // articles: 1-14, 14bis, 15-35.
      const sec = repo.getSection("constitucion", "Declaraciones");
      expect(sec).toBeDefined();
      expect(sec!.articulos).toHaveLength(36);
      expect(sec!.rango).toEqual({ primero: "1", ultimo: "35" });
    });

    it("Capítulo Segundo (Nuevos derechos) is nested under Primera Parte", () => {
      const nodes = repo.getNormStructure("constitucion");
      const primera = nodes.find((n) => n.tipo === "parte" && /primera/i.test(n.nombre ?? ""));
      const capSeg = nodes.find(
        (n) => n.tipo === "capitulo" && /nuevos derechos/i.test(n.nombre ?? ""),
      );
      expect(capSeg).toBeDefined();
      expect(capSeg!.parent_id).toBe(primera!.id);
    });
  });

  describe("getSection — list articles in a structural section", () => {
    it("retrieves Capítulo Segundo of the CN with all 8 articles (36-43)", () => {
      const sec = repo.getSection("constitucion", "Nuevos derechos");
      expect(sec).toBeDefined();
      expect(sec!.nodo.tipo).toBe("capitulo");
      const numeros = sec!.articulos.map((a) => a.numero);
      // Capítulo Segundo of CN spans arts 36..43 (8 articles)
      expect(numeros).toEqual(["36", "37", "38", "39", "40", "41", "42", "43"]);
      expect(sec!.rango).toEqual({ primero: "36", ultimo: "43" });
    });

    it("returns undefined for an unknown section", () => {
      expect(repo.getSection("constitucion", "Capítulo Inexistente XYZ")).toBeUndefined();
    });
  });

  describe("bug #2 — vigencia of foundational norms", () => {
    it("constitucion is vigente, not desconocido", () => {
      const meta = repo.getNormMetadata("constitucion");
      expect(meta!.estado_vigencia).toBe("vigente");
    });

    it("all 9 corpus norms are marked vigente", () => {
      const ids = ["constitucion", "ccyc", "penal", "cppf", "cpccn", "ley_24240", "ley_19549", "ley_19550", "ley_25326"];
      for (const id of ids) {
        const m = repo.getNormMetadata(id);
        expect(m!.estado_vigencia, `vigencia for ${id}`).toBe("vigente");
      }
    });
  });

  describe("bug #3 — search relevance: LDC art 1 in top-3 for 'consumidor'", () => {
    it("search('consumidor') returns ley_24240 art 1 in the first 3 hits", () => {
      const hits = repo.searchArticles("consumidor");
      const top3 = hits.slice(0, 3);
      const ldcHit = top3.find((h) => h.norma_id === "ley_24240" && h.articulo.numero === "1");
      expect(ldcHit, "LDC art. 1 should be in top-3 for query 'consumidor'").toBeDefined();
    });

    it("LDC hit has 'norma' in matched_on (norma-title boost fired)", () => {
      const hits = repo.searchArticles("consumidor");
      const ldcHit = hits.find((h) => h.norma_id === "ley_24240");
      expect(ldcHit).toBeDefined();
      expect(ldcHit!.matched_on).toContain("norma");
    });
  });
});
