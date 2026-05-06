#!/usr/bin/env node
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { openDb, resolveDbPath, type Db } from "../db/connection.js";
import { applySchema } from "../db/migrations.js";
import { loadLibrary, normalizeNumber } from "../laws/loader.js";
import type { Article, Inciso, Law, LawId } from "../laws/types.js";
import { TIER_BY_NORMA_ID, type LegalTier, type StructuralLevel } from "../laws/hierarchy.js";
import { DOCTRINA, NORMAS_POR_RAMA, PRINCIPIOS, RAMAS } from "../db/seeds/intelligence.js";
import {
  nestingDepth,
  splitArticleHeaders,
  trimTrailingOrphans,
  type DetectedHeader,
} from "./parsers/structural-headers.js";
import { extractTrailingEpigraphs } from "./parsers/base.js";

/**
 * Vigencia curada para las normas foundational del corpus.
 *
 * El default del schema es 'desconocido', que es razonable como fallback
 * pero cosmetically embarrassing en demos. Las normas listadas acá tienen
 * vigencia verificada manualmente como `vigente` al 2026-05-02.
 *
 * No es una fuente automatizada: si una de estas normas se deroga, el
 * mantenimiento de este map es responsabilidad del operador. Para una
 * verificación periódica programada, ver el follow-up en BACKLOG.md.
 */
const VIGENCIA_BY_NORMA_ID: Record<string, "vigente" | "derogada"> = {
  constitucion: "vigente",
  ccyc: "vigente",
  penal: "vigente",
  cppf: "vigente",
  cpccn: "vigente",
  ley_24240: "vigente",
  ley_19549: "vigente",
  ley_19550: "vigente",
  ley_25326: "vigente",
};

interface Args {
  db?: string;
  dataDir?: string;
  reset: boolean;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STRUCTURE_LEVELS = ["libro", "parte", "titulo", "capitulo", "seccion"] as const;
type StructureLevel = (typeof STRUCTURE_LEVELS)[number];

function parseArgs(argv: string[]): Args {
  const a: Args = { reset: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    const v = argv[i + 1];
    switch (k) {
      case "--db":
        a.db = v;
        i++;
        break;
      case "--data-dir":
        a.dataDir = v;
        i++;
        break;
      case "--reset":
        a.reset = true;
        break;
      case "-h":
      case "--help":
        process.stderr.write(
          "Uso: npm run db:import -- [--db <path>] [--data-dir <path>] [--reset]\n" +
            "  Lee los JSON desde data/ y los inserta en SQLite.\n" +
            "  --reset borra todo el contenido antes de cargar.\n",
        );
        process.exit(0);
      default:
        process.stderr.write(`[db-import] Opción desconocida: ${k}\n`);
        process.exit(2);
    }
  }
  return a;
}

function resolveTier(id: string): LegalTier {
  const tier = TIER_BY_NORMA_ID[id];
  if (!tier) {
    throw new Error(
      `Cannot ingest norma '${id}': not declared in TIER_BY_NORMA_ID. Add it to src/laws/hierarchy.ts first.`,
    );
  }
  return tier;
}

function numeroDeNorma(law: Law): string | null {
  if (law.id === "constitucion") return "Constitución Nacional";
  // Try officialNumber first ("Ley 24.240" → "24.240")
  const fromOfficial = law.officialNumber?.match(/(\d[\d.]*)/)?.[1];
  if (fromOfficial) return fromOfficial;
  // Fallback: extract digits from id ("ley_24240" → "24240")
  const m = law.id.match(/(\d+)/);
  return m ? m[1]! : null;
}

function articleId(normaId: string, articleNumber: string, suffix?: number): string {
  const base = `${normaId}_art_${normalizeNumber(articleNumber)}`;
  return suffix === undefined ? base : `${base}__${suffix}`;
}

function structureNodeId(normaId: string, levels: Array<[StructureLevel, string]>): string {
  // Stable id from the chain of (level, name) pairs
  const slug = levels
    .map(([l, n]) => `${l[0]!}-${slugify(n)}`)
    .join("__");
  return `${normaId}_${slug}`;
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function articleTextWithIncisos(article: Article, cleanText?: string): string {
  const body = (cleanText ?? article.text).trimEnd();
  if (article.incisos.length === 0) return body;
  const lines: string[] = [body];
  for (const inc of article.incisos) {
    // Trim orphan-caps tail from each inciso too — the legacy parser
    // sometimes appended the next section's marker to the LAST inciso of
    // an article (e.g., CPPF arts 96, 128, 308 carrying "EL CIVILMENTE
    // DEMANDADO" / "COMPROBACIONES DIRECTAS" inside the last inciso).
    const cleanedInc: Inciso = {
      id: inc.id,
      text: trimTrailingOrphans(inc.text),
    };
    lines.push(formatIncisoForStorage(cleanedInc));
  }
  return lines.join("\n");
}

function formatIncisoForStorage(inc: Inciso): string {
  // Mirrors src/laws/format.ts formatInciso() so the rendered form is identical.
  const clean = inc.text.trim().replace(/\n{2,}/g, "\n");
  const lines = clean.split("\n");
  if (lines.length === 1) return `- **${inc.id})** ${lines[0]}`;
  return [`- **${inc.id})** ${lines[0]}`, ...lines.slice(1).map((line) => `  ${line}`)].join("\n");
}

interface ValidationIssue {
  norma: LawId;
  message: string;
  fatal: boolean;
}

function validateLaw(law: Law): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!law.id) issues.push({ norma: law.id, message: "missing id", fatal: true });
  if (!law.title) issues.push({ norma: law.id, message: "missing title", fatal: true });
  if (law.lastUpdated && !ISO_DATE_RE.test(law.lastUpdated)) {
    issues.push({
      norma: law.id,
      message: `lastUpdated is not ISO YYYY-MM-DD: ${law.lastUpdated}`,
      fatal: true,
    });
  }
  for (const [i, art] of law.articles.entries()) {
    if (!art.number) {
      issues.push({ norma: law.id, message: `article #${i} missing number`, fatal: true });
    }
    if (!art.text) {
      // Some imported laws have officially-empty / placeholder articles
      // (e.g. derogated). Warn but don't block.
      issues.push({ norma: law.id, message: `article ${art.number} has empty text`, fatal: false });
    }
  }
  // Duplicate numbers within the same law are common in heavily-amended codes
  // (renumbering, "bis" promoted to a separate article, etc.). Warn only;
  // the import disambiguates the row id by appending the article order.
  const seen = new Set<string>();
  for (const art of law.articles) {
    const k = normalizeNumber(art.number);
    if (seen.has(k)) {
      issues.push({
        norma: law.id,
        message: `duplicate article number: ${art.number} (will be stored with order-suffixed id)`,
        fatal: false,
      });
    }
    seen.add(k);
  }
  return issues;
}

function reset(db: Db): void {
  // Order matters: child tables first (FK constraints with default RESTRICT).
  db.exec(`
    DELETE FROM jurisprudencia_norma;
    DELETE FROM jurisprudencia;
    DELETE FROM doctrina;
    DELETE FROM norma_rama;
    DELETE FROM principios_juridicos;
    DELETE FROM ramas_derecho;
    DELETE FROM relaciones_normativas;
    DELETE FROM articulo_estructura;
    DELETE FROM estructura_normativa;
    DELETE FROM articulos;
    DELETE FROM normas;
  `);
}

/**
 * Loads (or replaces) the curated intelligence-layer content: ramas, principios,
 * norma↔rama links and doctrina. Skips norma_rama entries whose `norma_id` is
 * not present in the corpus to avoid FK violations on a partial corpus.
 */
function seedIntelligence(db: Db): { ramas: number; principios: number; norma_rama: number; doctrina: number } {
  const counts = { ramas: 0, principios: 0, norma_rama: 0, doctrina: 0 };

  // Wipe and reload (idempotent on the seed; safer than upsert with FKs).
  db.exec(`
    DELETE FROM doctrina;
    DELETE FROM norma_rama;
    DELETE FROM principios_juridicos;
    DELETE FROM ramas_derecho;
  `);

  const insRama = db.prepare(`
    INSERT INTO ramas_derecho (id, nombre, descripcion, ambito, es_codificada)
    VALUES (@id, @nombre, @descripcion, @ambito, @es_codificada)
  `);
  for (const r of RAMAS) {
    insRama.run({
      id: r.id,
      nombre: r.nombre,
      descripcion: r.descripcion,
      ambito: r.ambito,
      es_codificada: r.es_codificada ? 1 : 0,
    });
    counts.ramas++;
  }

  const insPrinc = db.prepare(`
    INSERT INTO principios_juridicos (id, rama_id, nombre, enunciado, fuente, vigencia)
    VALUES (@id, @rama_id, @nombre, @enunciado, @fuente, @vigencia)
  `);
  for (const p of PRINCIPIOS) {
    insPrinc.run(p);
    counts.principios++;
  }

  // Only insert norma_rama for normas already in the DB (avoids FK errors when
  // the corpus is partial; e.g. provincial constitutions not yet ingested).
  const presentNormas = new Set(
    (db.prepare(`SELECT id FROM normas`).all() as Array<{ id: string }>).map((r) => r.id),
  );
  const insNR = db.prepare(`
    INSERT INTO norma_rama (norma_id, rama_id, relevancia)
    VALUES (@norma_id, @rama_id, @relevancia)
  `);
  for (const link of NORMAS_POR_RAMA) {
    if (!presentNormas.has(link.norma_id)) continue;
    insNR.run(link);
    counts.norma_rama++;
  }

  const insDoc = db.prepare(`
    INSERT INTO doctrina (id, autor, obra, ano_publicacion, rama_id, tipo, citacion, notas)
    VALUES (@id, @autor, @obra, @ano_publicacion, @rama_id, @tipo, @citacion, @notas)
  `);
  for (const d of DOCTRINA) {
    insDoc.run({
      id: d.id,
      autor: d.autor,
      obra: d.obra,
      ano_publicacion: d.ano_publicacion ?? null,
      rama_id: d.rama_id ?? null,
      tipo: d.tipo,
      citacion: d.citacion ?? null,
      notas: d.notas ?? null,
    });
    counts.doctrina++;
  }

  return counts;
}

interface InsertedCounts {
  norma: number;
  articulos: number;
  nodos: number;
}

function insertLaw(db: Db, law: Law): InsertedCounts {
  const insertNorma = db.prepare(`
    INSERT INTO normas (
      id, tier, numero, titulo, nombre_corto,
      jurisdiccion, pais, autoridad_emisora,
      fecha_sancion, fecha_promulgacion, fecha_publicacion,
      fuente_nombre, fuente_url, estado_vigencia,
      fecha_ultima_actualizacion, texto_ordenado, materias, notas
    ) VALUES (
      @id, @tier, @numero, @titulo, @nombre_corto,
      @jurisdiccion, @pais, @autoridad_emisora,
      @fecha_sancion, @fecha_promulgacion, @fecha_publicacion,
      @fuente_nombre, @fuente_url, @estado_vigencia,
      @fecha_ultima_actualizacion, @texto_ordenado, @materias, @notas
    )
  `);

  const insertArticulo = db.prepare(`
    INSERT INTO articulos (id, norma_id, numero, texto, orden, epigrafe)
    VALUES (@id, @norma_id, @numero, @texto, @orden, @epigrafe)
  `);

  const insertEstructura = db.prepare(`
    INSERT INTO estructura_normativa (id, norma_id, parent_id, tipo, nombre, orden)
    VALUES (@id, @norma_id, @parent_id, @tipo, @nombre, @orden)
  `);

  const insertArticuloEstructura = db.prepare(`
    INSERT INTO articulo_estructura (articulo_id, estructura_id)
    VALUES (@articulo_id, @estructura_id)
  `);

  const tier = resolveTier(law.id);
  // Provincial constitutions and CABA are technically not "nacional" jurisdiction.
  const jurisdiccion =
    tier === "constitucion_provincial" || tier === "constitucion_caba" || tier === "ley_provincial" || tier === "decreto_provincial"
      ? "provincial"
      : tier === "ordenanza_municipal"
        ? "municipal"
        : "nacional";

  insertNorma.run({
    id: law.id,
    tier,
    numero: numeroDeNorma(law),
    titulo: law.title,
    nombre_corto: law.shortName,
    jurisdiccion,
    pais: "Argentina",
    autoridad_emisora: null,
    fecha_sancion: null,
    fecha_promulgacion: null,
    fecha_publicacion: null,
    fuente_nombre: null,
    fuente_url: law.source,
    estado_vigencia: VIGENCIA_BY_NORMA_ID[law.id] ?? "desconocido",
    fecha_ultima_actualizacion: law.lastUpdated || null,
    texto_ordenado: 0,
    materias: null,
    notas: law.description ?? null,
  });

  // Two coexisting strategies for capturing structure:
  //
  //  (A) `art.location` populated → legacy parser worked (CCyC, CPPF, CPCCN).
  //      Use the location chain as authoritative; trailing-header detection
  //      not needed.
  //
  //  (B) `art.location` empty → legacy parser dropped structural info but it
  //      may still be reconstructible from the article text, where the
  //      legacy parser concatenated headers like "CAPÍTULO SEGUNDO" / "Nuevos
  //      derechos y garantías" at the end of the previous article. We detect
  //      those, strip them from the text, and promote them to estructura
  //      nodes via a running stack that determines the structural parent of
  //      subsequent articles.
  //
  // The two strategies are not mixed within a single norma — we pick (A) if
  // ANY article in the law has a populated location, otherwise (B).
  const useLegacyLocation = law.articles.some(
    (a) => Object.values(a.location).some((v) => !!v),
  );

  // Normas whose InfoLEG source places the article epigraph before the "Art. N"
  // marker, causing it to bleed into the previous article's body. The parsers
  // (parseLey19550, parseLey19549) already call extractTrailingEpigraphs at
  // fetch time; this pre-pass also cleans existing JSON without a re-fetch.
  const NORMAS_WITH_INFOLEG_EPIGRAPHS = new Set(["ley_19550", "ley_19549"]);
  if (NORMAS_WITH_INFOLEG_EPIGRAPHS.has(law.id)) {
    extractTrailingEpigraphs(law.articles);
  }

  // Track structural nodes already inserted so we dedupe across articles.
  const nodes = new Map<string, { tipo: StructureLevel; orden: number; parent_id: string | null }>();
  let nodeOrder = 0;
  let articulosInsertados = 0;
  const idCount = new Map<string, number>();

  // (B) running stack of open structural nodes, used when reconstructing
  // structure from trailing headers.
  const recoveryStack: Array<{ id: string; tipo: StructuralLevel; depth: number }> = [];
  // Counter for unique recovery-node ids within this law.
  let recoveryNodeIdx = 0;

  for (let i = 0; i < law.articles.length; i++) {
    const art = law.articles[i]!;
    const baseId = articleId(law.id, art.number);
    const count = idCount.get(baseId) ?? 0;
    idCount.set(baseId, count + 1);
    const aid = count === 0 ? baseId : articleId(law.id, art.number, count + 1);

    // Both strategies clean the article body of trailing-header noise.
    // (B) additionally captures the detected headers as estructura nodes;
    // (A) ignores them because `art.location` is authoritative for those
    // normas. We also trim any trailing orphan all-caps line that survived
    // both flows — this catches leakage in normas like the CPCCN where the
    // legacy parser left "SUBSISTENCIA DE LOS DOMICILIOS" hanging without
    // a following keyword.
    let cleanText: string | undefined;
    let trailingHeaders: DetectedHeader[] = [];
    if (!useLegacyLocation) {
      const split = splitArticleHeaders(art.text);
      cleanText = trimTrailingOrphans(split.cleanText);
      trailingHeaders = split.trailingHeaders;
    } else {
      cleanText = trimTrailingOrphans(art.text);
    }

    insertArticulo.run({
      id: aid,
      norma_id: law.id,
      numero: art.number,
      texto: articleTextWithIncisos(art, cleanText),
      orden: i,
      epigrafe: art.title ?? null,
    });
    articulosInsertados++;

    let leafId: string | null = null;

    if (useLegacyLocation) {
      // (A) Build the chain (level, name) from art.location.
      const chain: Array<[StructureLevel, string]> = [];
      for (const lvl of STRUCTURE_LEVELS) {
        const name = art.location[lvl];
        if (name) chain.push([lvl, name]);
      }
      let parentId: string | null = null;
      for (let j = 0; j < chain.length; j++) {
        const subchain = chain.slice(0, j + 1);
        const nodeId = structureNodeId(law.id, subchain);
        const [tipo, nombre] = subchain[subchain.length - 1]!;
        if (!nodes.has(nodeId)) {
          insertEstructura.run({
            id: nodeId,
            norma_id: law.id,
            parent_id: parentId,
            tipo,
            nombre,
            orden: nodeOrder++,
          });
          nodes.set(nodeId, { tipo, orden: nodeOrder - 1, parent_id: parentId });
        }
        parentId = nodeId;
        leafId = nodeId;
      }
    } else {
      // (B) Article belongs under whatever the recovery stack currently has
      // as its leaf. The stack reflects the headers we've seen in PREVIOUS
      // articles' trailing text.
      if (recoveryStack.length > 0) {
        leafId = recoveryStack[recoveryStack.length - 1]!.id;
      }
    }

    if (leafId) {
      insertArticuloEstructura.run({ articulo_id: aid, estructura_id: leafId });
    }

    // (B) After linking the article, process its trailing headers — these
    // open sections that the NEXT articles will live under.
    for (const h of trailingHeaders) {
      const depth = nestingDepth(h.tipo);
      while (
        recoveryStack.length > 0 &&
        recoveryStack[recoveryStack.length - 1]!.depth >= depth
      ) {
        recoveryStack.pop();
      }
      const parentId =
        recoveryStack.length > 0 ? recoveryStack[recoveryStack.length - 1]!.id : null;
      const newNodeId = `${law.id}_recovered_${recoveryNodeIdx++}`;
      // splitArticleHeaders only emits the 5 nesting levels by construction
      // (parte | libro | titulo | capitulo | seccion). Narrow for the
      // local `nodes` map which is typed against that subset.
      const nestingTipo = h.tipo as StructureLevel;
      insertEstructura.run({
        id: newNodeId,
        norma_id: law.id,
        parent_id: parentId,
        tipo: nestingTipo,
        nombre: h.nombre,
        orden: nodeOrder++,
      });
      nodes.set(newNodeId, { tipo: nestingTipo, orden: nodeOrder - 1, parent_id: parentId });
      recoveryStack.push({ id: newNodeId, tipo: h.tipo, depth });
    }
  }

  return { norma: 1, articulos: articulosInsertados, nodos: nodes.size };
}


export interface ImportResult {
  totals: { norma: number; articulos: number; nodos: number };
  warnings: ValidationIssue[];
  fatalErrors: ValidationIssue[];
}

/**
 * Runs the JSON → SQLite ingest. Used by the CLI entrypoint and the test
 * suite. Returns counts plus the validation issues separated by severity.
 * The caller decides how to react (CLI exits on fatal; tests assert).
 */
export function importIntoDb(db: Db, laws: Law[], opts: { reset?: boolean } = {}): ImportResult {
  const allIssues: ValidationIssue[] = [];
  for (const law of laws) {
    allIssues.push(...validateLaw(law));
  }
  const warnings = allIssues.filter((i) => !i.fatal);
  const fatalErrors = allIssues.filter((i) => i.fatal);
  if (fatalErrors.length > 0) {
    return { totals: { norma: 0, articulos: 0, nodos: 0 }, warnings, fatalErrors };
  }

  if (opts.reset) reset(db);

  const totals = { norma: 0, articulos: 0, nodos: 0 };
  const tx = db.transaction(() => {
    for (const law of laws) {
      const counts = insertLaw(db, law);
      totals.norma += counts.norma;
      totals.articulos += counts.articulos;
      totals.nodos += counts.nodos;
    }
    // Load the intelligence-layer seed alongside the corpus. Doing it inside
    // the same transaction keeps the DB consistent with the curated content.
    seedIntelligence(db);
  });
  tx();
  // Defensive FTS rebuild: triggers keep articulos_fts in sync with articulos
  // for normal inserts, but a freshly-applied schema over a pre-existing DB
  // would leave the index empty. The rebuild is idempotent and ~ms-scale.
  db.exec(`INSERT INTO articulos_fts(articulos_fts) VALUES('rebuild')`);
  return { totals, warnings, fatalErrors };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = resolveDbPath({ path: args.db });
  if (dbPath !== ":memory:") {
    await mkdir(path.dirname(dbPath), { recursive: true });
  }
  const db = openDb({ path: dbPath });
  applySchema(db);

  const lib = await loadLibrary({ dataDir: args.dataDir });
  if (lib.errors.length > 0) {
    for (const e of lib.errors) {
      process.stderr.write(`[db-import] ERROR ${e.law}: ${e.error}\n`);
    }
    db.close();
    process.exit(1);
  }

  const laws = [...lib.laws.values()];
  const result = importIntoDb(db, laws, { reset: args.reset });

  if (result.fatalErrors.length > 0) {
    for (const e of result.fatalErrors) {
      process.stderr.write(`[db-import] VALIDATION ERROR ${e.norma}: ${e.message}\n`);
    }
    db.close();
    process.exit(1);
  }
  if (process.env.ARGLEG_VALIDATE_VERBOSE === "1") {
    for (const w of result.warnings) {
      process.stderr.write(`[db-import] VALIDATION WARN ${w.norma}: ${w.message}\n`);
    }
  } else if (result.warnings.length > 0) {
    process.stderr.write(
      `[db-import] ${result.warnings.length} validation warnings (set ARGLEG_VALIDATE_VERBOSE=1 to see them)\n`,
    );
  }
  if (args.reset) process.stderr.write(`[db-import] Reset OK\n`);
  for (const law of laws) {
    const arts = db
      .prepare(`SELECT COUNT(*) AS c FROM articulos WHERE norma_id = ?`)
      .get(law.id) as { c: number };
    const nodes = db
      .prepare(`SELECT COUNT(*) AS c FROM estructura_normativa WHERE norma_id = ?`)
      .get(law.id) as { c: number };
    process.stderr.write(`[db-import] ${law.id}: ${arts.c} artículos, ${nodes.c} nodos\n`);
  }

  const totals = result.totals;
  db.close();
  process.stderr.write(
    `[db-import] OK — ${totals.norma} normas, ${totals.articulos} artículos, ${totals.nodos} nodos → ${dbPath}\n`,
  );
}

// Only run as a CLI when invoked directly (not when imported by tests).
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
    process.stderr.write(`[db-import] ${msg}\n`);
    process.exit(1);
  });
}
