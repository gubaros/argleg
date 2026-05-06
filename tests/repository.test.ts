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

  it("findNormaByShortName resolves the nombre_corto alias (case-insensitive)", () => {
    expect(repo.findNormaByShortName("LPA")).toBe("ley_19549");
    expect(repo.findNormaByShortName("lpa")).toBe("ley_19549");
    expect(repo.findNormaByShortName("Lpa")).toBe("ley_19549");
  });

  it("getArticle auto-resolves nombre_corto aliases", () => {
    const baseline = repo.getArticle("ley_19549", "1");
    expect(baseline).toBeDefined();
    for (const alias of ["LPA", "lpa", "Lpa"]) {
      const result = repo.getArticle(alias, "1");
      expect(result, `alias ${alias}`).toBeDefined();
      expect(result!.articulo.id).toBe(baseline!.articulo.id);
    }
  });

  it("getNormMetadata auto-resolves nombre_corto aliases", () => {
    expect(repo.getNormMetadata("LPA")?.id).toBe("ley_19549");
    expect(repo.getNormMetadata("lpa")?.id).toBe("ley_19549");
  });

  it("findNormaByShortName strips diacritics", () => {
    // Insert a row with an accented short name to exercise the fold path.
    const db = (repo as unknown as { db: import("../src/db/connection.js").Db }).db;
    db.exec(`
      INSERT INTO normas (id, tier, titulo, nombre_corto, jurisdiccion, pais, estado_vigencia, fecha_ultima_actualizacion)
      VALUES ('test_acentos', 'ley_federal', 'Ley con acentos', 'Código X', 'nacional', 'Argentina', 'vigente', '2026-01-01');
    `);
    expect(repo.findNormaByShortName("codigo x")).toBe("test_acentos");
    expect(repo.findNormaByShortName("Código X")).toBe("test_acentos");
    expect(repo.findNormaByShortName("CODIGO X")).toBe("test_acentos");
  });

  it("findNormaByShortName returns null for empty, unknown, or ambiguous input", () => {
    expect(repo.findNormaByShortName("")).toBeNull();
    expect(repo.findNormaByShortName("xyz")).toBeNull();
    // Insert a duplicate nombre_corto to exercise the ambiguity guard.
    const db = (repo as unknown as { db: import("../src/db/connection.js").Db }).db;
    db.exec(`
      INSERT INTO normas (id, tier, titulo, nombre_corto, jurisdiccion, pais, estado_vigencia, fecha_ultima_actualizacion)
      VALUES
        ('dup_a', 'ley_federal', 'Norma A', 'DUP', 'nacional', 'Argentina', 'vigente', '2026-01-01'),
        ('dup_b', 'ley_federal', 'Norma B', 'DUP', 'nacional', 'Argentina', 'vigente', '2026-01-01');
    `);
    expect(repo.findNormaByShortName("DUP")).toBeNull();
  });
});

describe("searchArticles scoring — bug #3: norma-title boost + term-frequency density", () => {
  let repo: SqliteLegalRepository;

  beforeEach(() => {
    const db = openDb({ path: ":memory:" });
    applySchema(db);
    repo = new SqliteLegalRepository(db);
    const handle = (repo as unknown as { db: import("../src/db/connection.js").Db }).db;
    // Two normas: one specialised in "consumidor" (by title), one generic.
    handle.exec(`
      INSERT INTO normas (id, tier, titulo, nombre_corto, jurisdiccion, pais, estado_vigencia, fecha_ultima_actualizacion)
      VALUES
        ('ldc_test', 'ley_federal', 'Ley de Defensa del Consumidor', 'LDC',
         'nacional', 'Argentina', 'vigente', '2026-01-01'),
        ('other_test', 'codigo_fondo', 'Código Civil y Comercial', 'CCyC',
         'nacional', 'Argentina', 'vigente', '2026-01-01');

      INSERT INTO articulos (id, norma_id, numero, texto, orden, epigrafe) VALUES
        ('ldc_art1',   'ldc_test',   '1',  'El consumidor es la persona que adquiere bienes. El proveedor no es consumidor.', 0, NULL),
        ('other_art1', 'other_test', '1',  'El consumidor en este código tiene derechos.', 0, NULL),
        ('other_art2', 'other_test', '2',  'Texto no relacionado.', 1, NULL);
    `);
  });

  it("norma-title match adds 'norma' to matched_on", () => {
    const hits = repo.searchArticles("consumidor");
    const ldcHit = hits.find((h) => h.norma_id === "ldc_test" && h.articulo.numero === "1");
    expect(ldcHit).toBeDefined();
    expect(ldcHit!.matched_on).toContain("norma");
  });

  it("ldc art 1 ranks above other_art1 for query 'consumidor' (norma-title boost)", () => {
    const hits = repo.searchArticles("consumidor");
    const ldcIdx = hits.findIndex((h) => h.norma_id === "ldc_test");
    const otherIdx = hits.findIndex((h) => h.norma_id === "other_test" && h.articulo.numero === "1");
    expect(ldcIdx).toBeGreaterThanOrEqual(0);
    expect(otherIdx).toBeGreaterThanOrEqual(0);
    // LDC gets +5 norma-title bonus + density bonus (2 occurrences) → beats the CCyC article.
    expect(ldcIdx).toBeLessThan(otherIdx);
  });

  it("term-frequency density: article with 2 occurrences scores higher than 1 occurrence", () => {
    // ldc_art1 has "consumidor" twice; other_art1 has it once (both norma contexts differ,
    // so isolate the effect by filtering to just other_test articles which have NO norma-title boost).
    const handle = (repo as unknown as { db: import("../src/db/connection.js").Db }).db;
    handle.exec(`
      INSERT INTO articulos (id, norma_id, numero, texto, orden, epigrafe) VALUES
        ('other_art3', 'other_test', '3', 'El consumidor actúa como consumidor de bienes.', 2, NULL),
        ('other_art4', 'other_test', '4', 'El consumidor.', 3, NULL);
    `);
    const hits = repo.searchArticles("consumidor", { norma_id: "other_test" });
    // art3 has "consumidor" twice → density bonus → must rank above art4 (once).
    const idx3 = hits.findIndex((h) => h.articulo.numero === "3");
    const idx4 = hits.findIndex((h) => h.articulo.numero === "4");
    expect(idx3).toBeGreaterThanOrEqual(0);
    expect(idx4).toBeGreaterThanOrEqual(0);
    expect(idx3).toBeLessThan(idx4);
  });
});
