import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "../src/db/connection.js";
import { applySchema } from "../src/db/migrations.js";
import { SqliteLegalRepository } from "../src/laws/sqlite-repository.js";

function seedFixtures(repo: SqliteLegalRepository): void {
  // Use the underlying db directly via the repo's prepared statements path.
  // We expose the db handle through a small helper here.
  const db = (repo as unknown as { db: import("../src/db/connection.js").Db }).db;
  db.exec(`
    INSERT INTO normas (id, tier, titulo, nombre_corto, jurisdiccion, pais, estado_vigencia, fuente_url, fecha_ultima_actualizacion, numero)
    VALUES
      ('test_ley_1', 'ley_federal', 'Ley de prueba 1', 'L1', 'nacional', 'Argentina', 'vigente',
       'https://example.test/l1', '2026-01-01', '1.000'),
      ('test_ley_2', 'ley_federal', 'Ley de prueba 2', 'L2', 'nacional', 'Argentina', 'desconocido',
       'https://example.test/l2', '2026-01-02', '2.000');

    INSERT INTO estructura_normativa (id, norma_id, parent_id, tipo, nombre, orden)
    VALUES
      ('struct_a', 'test_ley_1', NULL, 'titulo', 'Disposiciones generales', 0),
      ('struct_b', 'test_ley_1', 'struct_a', 'capitulo', 'Definiciones', 1);

    INSERT INTO articulos (id, norma_id, numero, texto, orden, epigrafe)
    VALUES
      ('test_ley_1_art_1', 'test_ley_1', '1', 'Esta ley regula el habeas data y la protección integral.', 0, 'Objeto'),
      ('test_ley_1_art_2', 'test_ley_1', '2', 'Definiciones aplicables a la presente ley.', 1, 'Definiciones'),
      ('test_ley_2_art_1', 'test_ley_2', '1', 'Norma sobre temas no relacionados.', 0, 'Inicio');

    INSERT INTO articulo_estructura (articulo_id, estructura_id) VALUES
      ('test_ley_1_art_1', 'struct_a'),
      ('test_ley_1_art_2', 'struct_b');
  `);
}

describe("SqliteLegalRepository", () => {
  let repo: SqliteLegalRepository;

  beforeEach(() => {
    const db = openDb({ path: ":memory:" });
    applySchema(db);
    repo = new SqliteLegalRepository(db);
    seedFixtures(repo);
  });

  it("listNorms returns all rows by default", () => {
    const all = repo.listNorms();
    expect(all).toHaveLength(2);
    expect(all.map((n) => n.id).sort()).toEqual(["test_ley_1", "test_ley_2"]);
  });

  it("listNorms filters by estado_vigencia", () => {
    const vigentes = repo.listNorms({ estado_vigencia: "vigente" });
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0]!.id).toBe("test_ley_1");
  });

  it("listNorms filters by tier", () => {
    const leyes = repo.listNorms({ tier: "ley_federal" });
    expect(leyes).toHaveLength(2);
    const codigos = repo.listNorms({ tier: "codigo_fondo" });
    expect(codigos).toHaveLength(0);
  });

  it("getNormMetadata returns the norma with structural summary", () => {
    const meta = repo.getNormMetadata("test_ley_1");
    expect(meta).toBeDefined();
    expect(meta!.titulo).toBe("Ley de prueba 1");
    expect(meta!.resumen_estructural.cantidad_articulos).toBe(2);
    expect(meta!.resumen_estructural.tiene_titulos).toBe(true);
    expect(meta!.resumen_estructural.tiene_capitulos).toBe(true);
    expect(meta!.resumen_estructural.tiene_secciones).toBe(false);
    expect(meta!.resumen_estructural.profundidad_maxima).toBeGreaterThanOrEqual(2);
  });

  it("getNormMetadata returns undefined for unknown norma", () => {
    expect(repo.getNormMetadata("no_existe")).toBeUndefined();
  });

  it("getArticle returns the row plus its structural context", () => {
    const result = repo.getArticle("test_ley_1", "2");
    expect(result).toBeDefined();
    expect(result!.articulo.numero).toBe("2");
    expect(result!.articulo.epigrafe).toBe("Definiciones");
    expect(result!.contexto_estructural.map((n) => n.tipo)).toContain("capitulo");
  });

  it("getArticle returns undefined for missing article", () => {
    expect(repo.getArticle("test_ley_1", "999")).toBeUndefined();
  });

  it("searchArticles finds by text token", () => {
    const hits = repo.searchArticles("habeas data");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.norma_id).toBe("test_ley_1");
    expect(hits[0]!.articulo.numero).toBe("1");
    expect(hits[0]!.matched_on).toContain("texto");
  });

  it("searchArticles respects norma_id filter", () => {
    const hits = repo.searchArticles("ley", { norma_id: "test_ley_2" });
    for (const h of hits) {
      expect(h.norma_id).toBe("test_ley_2");
    }
  });

  it("searchArticles ranks article-number matches highest", () => {
    const hits = repo.searchArticles("1");
    expect(hits[0]!.articulo.numero).toBe("1");
    expect(hits[0]!.matched_on).toContain("numero");
  });

  it("getNormStructure returns ordered structural nodes", () => {
    const nodes = repo.getNormStructure("test_ley_1");
    expect(nodes.map((n) => n.tipo)).toEqual(["titulo", "capitulo"]);
  });

  it("listArticles returns articles in storage order", () => {
    const arts = repo.listArticles("test_ley_1");
    expect(arts.map((a) => a.numero)).toEqual(["1", "2"]);
  });
});

describe("SqliteLegalRepository: norma_id canonicalization", () => {
  let repo: SqliteLegalRepository;

  beforeEach(() => {
    const db = openDb({ path: ":memory:" });
    applySchema(db);
    repo = new SqliteLegalRepository(db);
    // Seed a row whose id IS a canonical key in TIER_BY_NORMA_ID so that
    // canonicalNormaId actually does work resolving variants.
    const handle = (repo as unknown as { db: import("../src/db/connection.js").Db }).db;
    handle.exec(`
      INSERT INTO normas (id, tier, titulo, nombre_corto, jurisdiccion, pais, estado_vigencia, fuente_url, fecha_ultima_actualizacion, numero)
      VALUES ('ley_19549', 'ley_federal', 'Ley de Procedimientos Administrativos', 'LPA',
              'nacional', 'Argentina', 'vigente', 'https://example.test/lpa', '2026-01-01', '19.549');

      INSERT INTO articulos (id, norma_id, numero, texto, orden, epigrafe)
      VALUES ('lpa_art_1', 'ley_19549', '1', 'Las normas del procedimiento administrativo nacional.', 0, 'Ámbito');

      INSERT INTO estructura_normativa (id, norma_id, parent_id, tipo, nombre, orden)
      VALUES ('lpa_titulo_1', 'ley_19549', NULL, 'titulo', 'Disposiciones generales', 0);

      INSERT INTO articulo_estructura (articulo_id, estructura_id) VALUES ('lpa_art_1', 'lpa_titulo_1');
    `);
  });

  it("getArticle resolves spaced/dotted/upper-case variants", () => {
    const variants = ["ley_19549", "Ley 19.549", "ley 19549", "LEY-19.549", "Ley_19549"];
    const baseline = repo.getArticle("ley_19549", "1");
    expect(baseline).toBeDefined();
    for (const v of variants) {
      const result = repo.getArticle(v, "1");
      expect(result, `variant ${v}`).toBeDefined();
      expect(result!.articulo.id).toBe(baseline!.articulo.id);
    }
  });

  it("getNormMetadata resolves variants", () => {
    const meta = repo.getNormMetadata("Ley 19.549");
    expect(meta).toBeDefined();
    expect(meta!.id).toBe("ley_19549");
  });

  it("getNormMetadata still returns undefined for bare-number input (no type assumption)", () => {
    expect(repo.getNormMetadata("19549")).toBeUndefined();
  });

  it("searchArticles canonicalizes the norma_id filter", () => {
    const hits = repo.searchArticles("procedimiento", { norma_id: "Ley 19.549" });
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.norma_id).toBe("ley_19549");
    }
  });

  it("getNormStructure canonicalizes input", () => {
    const nodes = repo.getNormStructure("LEY 19.549");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.tipo).toBe("titulo");
  });
});
