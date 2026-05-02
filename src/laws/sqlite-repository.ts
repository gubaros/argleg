import type { Db } from "../db/connection.js";
import { normalizeNumber } from "./loader.js";
import type { LegalTier } from "./hierarchy.js";
import type {
  ArticuloConContexto,
  ArticuloRow,
  DoctrinaEntry,
  EstructuraNodo,
  JurisprudenciaEntry,
  LegalRepository,
  ListNormsFilter,
  Norma,
  NormaConResumen,
  NormaPorRama,
  PrincipioJuridico,
  RamaConContenido,
  RamaDerecho,
  ResumenEstructural,
  SearchHitRow,
  SearchOptions,
  SeccionConArticulos,
} from "./repository.js";

interface NormaRowRaw {
  id: string;
  tier: string;
  numero: string | null;
  titulo: string;
  nombre_corto: string | null;
  jurisdiccion: string;
  pais: string;
  autoridad_emisora: string | null;
  fecha_sancion: string | null;
  fecha_promulgacion: string | null;
  fecha_publicacion: string | null;
  fuente_nombre: string | null;
  fuente_url: string | null;
  estado_vigencia: string;
  fecha_ultima_actualizacion: string | null;
  texto_ordenado: number;
  materias: string | null;
  notas: string | null;
}

function normaFromRow(r: NormaRowRaw): Norma {
  return {
    ...r,
    tier: r.tier as LegalTier,
    materias: r.materias ? safeJsonArray(r.materias) : null,
  };
}

function safeJsonArray(s: string): string[] | null {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

/** Removes diacritics and lowercases for tolerant Spanish matching (mirrors search.ts). */
function foldText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function tokenize(query: string): string[] {
  return foldText(query)
    .split(/[^a-z0-9áéíóúñü]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export class SqliteLegalRepository implements LegalRepository {
  constructor(private readonly db: Db) {}

  listNorms(filter: ListNormsFilter = {}): Norma[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.tier) {
      where.push("tier = @tier");
      params.tier = filter.tier;
    }
    if (filter.estado_vigencia) {
      where.push("estado_vigencia = @estado_vigencia");
      params.estado_vigencia = filter.estado_vigencia;
    }
    if (filter.materia) {
      // materias is a JSON array string; we use LIKE for a coarse contains match.
      where.push("materias LIKE @materia_like");
      params.materia_like = `%"${filter.materia}"%`;
    }
    const sql =
      `SELECT * FROM normas` +
      (where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "") +
      ` ORDER BY id ASC`;
    const rows = this.db.prepare(sql).all(params) as NormaRowRaw[];
    return rows.map(normaFromRow);
  }

  getNormMetadata(normaId: string): NormaConResumen | undefined {
    const row = this.db
      .prepare(`SELECT * FROM normas WHERE id = ?`)
      .get(normaId) as NormaRowRaw | undefined;
    if (!row) return undefined;
    return {
      ...normaFromRow(row),
      resumen_estructural: this.buildResumen(normaId),
    };
  }

  getArticle(normaId: string, articleNumber: string): ArticuloConContexto | undefined {
    const norma = this.db
      .prepare(`SELECT * FROM normas WHERE id = ?`)
      .get(normaId) as NormaRowRaw | undefined;
    if (!norma) return undefined;

    const target = normalizeNumber(articleNumber);
    // Try fast path: exact match on stored articulos.numero.
    let articulo = this.db
      .prepare(`SELECT * FROM articulos WHERE norma_id = ? AND numero = ?`)
      .get(normaId, articleNumber) as ArticuloRow | undefined;

    if (!articulo) {
      // Fallback: scan and compare with normalizeNumber (handles "14bis" vs "14 bis", etc.).
      const all = this.db
        .prepare(`SELECT * FROM articulos WHERE norma_id = ? ORDER BY orden ASC`)
        .all(normaId) as ArticuloRow[];
      articulo = all.find((a) => normalizeNumber(a.numero) === target);
    }
    if (!articulo) return undefined;

    return {
      articulo,
      norma: normaFromRow(norma),
      contexto_estructural: this.getStructureForArticle(articulo.id),
    };
  }

  searchArticles(query: string, opts: SearchOptions = {}): SearchHitRow[] {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];
    const limit = Math.max(1, Math.min(opts.limit ?? 20, 100));

    // Pull candidate articles with at least one substring match across the
    // searchable columns. We OR every token and let the JS reranker score.
    const where: string[] = ["1=1"];
    const params: Record<string, unknown> = {};
    if (opts.norma_id) {
      where.push("a.norma_id = @norma_id");
      params.norma_id = opts.norma_id;
    }

    const tokenClauses: string[] = [];
    tokens.forEach((t, i) => {
      const k = `t${i}`;
      params[k] = `%${t}%`;
      tokenClauses.push(
        `(LOWER(a.numero) LIKE @${k} OR LOWER(a.epigrafe) LIKE @${k} OR LOWER(a.texto) LIKE @${k})`,
      );
    });
    if (tokenClauses.length > 0) {
      where.push(`(${tokenClauses.join(" OR ")})`);
    }

    const rows = this.db
      .prepare(
        `SELECT a.*, n.titulo AS norma_titulo, n.nombre_corto AS norma_nombre_corto
         FROM articulos a
         JOIN normas n ON n.id = a.norma_id
         WHERE ${where.join(" AND ")}`,
      )
      .all(params) as Array<ArticuloRow & { norma_titulo: string; norma_nombre_corto: string | null }>;

    const scored: SearchHitRow[] = [];
    for (const row of rows) {
      const articulo: ArticuloRow = {
        id: row.id,
        norma_id: row.norma_id,
        numero: row.numero,
        texto: row.texto,
        orden: row.orden,
        epigrafe: row.epigrafe,
      };
      const contexto = this.getStructureForArticle(row.id);
      const { score, matchedOn } = this.scoreArticle(articulo, contexto, tokens);
      if (score <= 0) continue;
      scored.push({
        norma_id: row.norma_id,
        norma_titulo: row.norma_titulo,
        norma_nombre_corto: row.norma_nombre_corto,
        articulo,
        contexto_estructural: contexto,
        score,
        matched_on: matchedOn,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  getNormStructure(normaId: string): EstructuraNodo[] {
    return this.db
      .prepare(
        `SELECT * FROM estructura_normativa WHERE norma_id = ? ORDER BY orden ASC`,
      )
      .all(normaId) as EstructuraNodo[];
  }

  listArticles(normaId: string): ArticuloRow[] {
    return this.db
      .prepare(`SELECT * FROM articulos WHERE norma_id = ? ORDER BY orden ASC`)
      .all(normaId) as ArticuloRow[];
  }

  getSection(normaId: string, identificador: string): SeccionConArticulos | undefined {
    // Resolve the section by id first (most specific), then by case-insensitive
    // substring of nombre. Restrict to the given norma.
    const idCandidate = this.db
      .prepare(`SELECT * FROM estructura_normativa WHERE norma_id = ? AND id = ?`)
      .get(normaId, identificador) as EstructuraNodo | undefined;
    const nodo =
      idCandidate ??
      (this.db
        .prepare(
          `SELECT * FROM estructura_normativa
           WHERE norma_id = ? AND LOWER(nombre) LIKE @needle
           ORDER BY orden ASC LIMIT 1`,
        )
        .get(normaId, { needle: `%${identificador.toLowerCase()}%` }) as
        | EstructuraNodo
        | undefined);
    if (!nodo) return undefined;

    // Walk ancestors via parent_id.
    const ancestros: EstructuraNodo[] = [];
    let current: EstructuraNodo | undefined = nodo;
    while (current && current.parent_id) {
      const parent = this.db
        .prepare(`SELECT * FROM estructura_normativa WHERE id = ?`)
        .get(current.parent_id) as EstructuraNodo | undefined;
      if (!parent) break;
      ancestros.unshift(parent);
      current = parent;
    }

    // Articles attached to THIS node (direct children only).
    const articulos = this.db
      .prepare(
        `SELECT a.* FROM articulo_estructura ae
         JOIN articulos a ON a.id = ae.articulo_id
         WHERE ae.estructura_id = ?
         ORDER BY a.orden ASC`,
      )
      .all(nodo.id) as ArticuloRow[];

    const rango =
      articulos.length > 0
        ? { primero: articulos[0]!.numero, ultimo: articulos[articulos.length - 1]!.numero }
        : null;

    return { nodo, ancestros, articulos, rango };
  }

  // ─── Intelligence layer ────────────────────────────────────────────────────

  listRamas(): RamaDerecho[] {
    interface RamaRow {
      id: string;
      nombre: string;
      descripcion: string | null;
      ambito: RamaDerecho["ambito"];
      es_codificada: number;
    }
    const rows = this.db
      .prepare(`SELECT * FROM ramas_derecho ORDER BY id ASC`)
      .all() as RamaRow[];
    return rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      descripcion: r.descripcion,
      ambito: r.ambito,
      es_codificada: !!r.es_codificada,
    }));
  }

  getRamaConContenido(ramaId: string): RamaConContenido | undefined {
    interface RamaRow {
      id: string;
      nombre: string;
      descripcion: string | null;
      ambito: RamaDerecho["ambito"];
      es_codificada: number;
    }
    const ramaRow = this.db
      .prepare(`SELECT * FROM ramas_derecho WHERE id = ?`)
      .get(ramaId) as RamaRow | undefined;
    if (!ramaRow) return undefined;
    const rama: RamaDerecho = {
      id: ramaRow.id,
      nombre: ramaRow.nombre,
      descripcion: ramaRow.descripcion,
      ambito: ramaRow.ambito,
      es_codificada: !!ramaRow.es_codificada,
    };

    const principios = this.db
      .prepare(`SELECT * FROM principios_juridicos WHERE rama_id = ? ORDER BY id ASC`)
      .all(ramaId) as PrincipioJuridico[];

    const normaLinks = this.db
      .prepare(
        `SELECT nr.relevancia, n.* FROM norma_rama nr
         JOIN normas n ON n.id = nr.norma_id
         WHERE nr.rama_id = ?
         ORDER BY nr.relevancia ASC, n.id ASC`,
      )
      .all(ramaId) as Array<NormaPorRama & Norma & { relevancia: NormaPorRama["relevancia"] }>;
    const normas = normaLinks.map((row) => {
      const { relevancia, ...rest } = row as unknown as Record<string, unknown> & {
        relevancia: NormaPorRama["relevancia"];
      };
      // Normalize materias JSON / coerce tier
      const norma = {
        ...(rest as unknown as Norma),
        materias: rest.materias ? JSON.parse(String(rest.materias)) : null,
      } as Norma;
      return { norma, relevancia };
    });

    const doctrina = this.db
      .prepare(`SELECT * FROM doctrina WHERE rama_id = ? ORDER BY autor ASC, ano_publicacion ASC`)
      .all(ramaId) as DoctrinaEntry[];

    const jurisprudencia = this.db
      .prepare(`SELECT * FROM jurisprudencia WHERE rama_id = ? ORDER BY fecha DESC NULLS LAST`)
      .all(ramaId) as JurisprudenciaEntry[];

    return { rama, principios, normas, doctrina, jurisprudencia };
  }

  getRamasDeNorma(
    normaId: string,
  ): Array<{ rama: RamaDerecho; relevancia: NormaPorRama["relevancia"] }> {
    interface RamaRowWithRelevancia {
      id: string;
      nombre: string;
      descripcion: string | null;
      ambito: RamaDerecho["ambito"];
      es_codificada: number;
      relevancia: NormaPorRama["relevancia"];
    }
    const rows = this.db
      .prepare(
        `SELECT r.*, nr.relevancia FROM norma_rama nr
         JOIN ramas_derecho r ON r.id = nr.rama_id
         WHERE nr.norma_id = ?
         ORDER BY nr.relevancia ASC, r.id ASC`,
      )
      .all(normaId) as RamaRowWithRelevancia[];
    return rows.map((r) => ({
      rama: {
        id: r.id,
        nombre: r.nombre,
        descripcion: r.descripcion,
        ambito: r.ambito,
        es_codificada: !!r.es_codificada,
      },
      relevancia: r.relevancia,
    }));
  }

  close(): void {
    this.db.close();
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private getStructureForArticle(articuloId: string): EstructuraNodo[] {
    return this.db
      .prepare(
        `SELECT e.*
         FROM articulo_estructura ae
         JOIN estructura_normativa e ON e.id = ae.estructura_id
         WHERE ae.articulo_id = ?
         ORDER BY e.orden ASC`,
      )
      .all(articuloId) as EstructuraNodo[];
  }

  private buildResumen(normaId: string): ResumenEstructural {
    const articleCount = (this.db
      .prepare(`SELECT COUNT(*) AS c FROM articulos WHERE norma_id = ?`)
      .get(normaId) as { c: number }).c;

    const tipos = this.db
      .prepare(
        `SELECT tipo, COUNT(*) AS c FROM estructura_normativa WHERE norma_id = ? GROUP BY tipo`,
      )
      .all(normaId) as Array<{ tipo: string; c: number }>;
    const byTipo = new Map(tipos.map((t) => [t.tipo, t.c]));

    // Compute structural depth via recursive CTE.
    const depth = (this.db
      .prepare(
        `WITH RECURSIVE chain(id, parent_id, depth) AS (
           SELECT id, parent_id, 1 FROM estructura_normativa
             WHERE norma_id = ? AND parent_id IS NULL
           UNION ALL
           SELECT e.id, e.parent_id, c.depth + 1
           FROM estructura_normativa e
           JOIN chain c ON e.parent_id = c.id
         )
         SELECT COALESCE(MAX(depth), 0) AS d FROM chain`,
      )
      .get(normaId) as { d: number }).d;

    const niveles = ["libro", "parte", "titulo", "capitulo", "seccion"].filter((t) =>
      byTipo.has(t),
    );
    if (articleCount > 0) niveles.push("articulo");

    return {
      niveles,
      tiene_libros: byTipo.has("libro"),
      tiene_partes: byTipo.has("parte"),
      tiene_titulos: byTipo.has("titulo"),
      tiene_capitulos: byTipo.has("capitulo"),
      tiene_secciones: byTipo.has("seccion"),
      tiene_inciso: false, // schema does not model incisos as a separate level
      cantidad_articulos: articleCount,
      cantidad_titulos: byTipo.get("titulo") ?? 0,
      cantidad_capitulos: byTipo.get("capitulo") ?? 0,
      cantidad_secciones: byTipo.get("seccion") ?? 0,
      profundidad_maxima: depth + (articleCount > 0 ? 1 : 0), // articles count as one extra level
    };
  }

  private scoreArticle(
    a: ArticuloRow,
    contexto: EstructuraNodo[],
    tokens: string[],
  ): { score: number; matchedOn: SearchHitRow["matched_on"] } {
    const matchedOn = new Set<SearchHitRow["matched_on"][number]>();
    let score = 0;

    const numero = foldText(a.numero);
    const epigrafe = a.epigrafe ? foldText(a.epigrafe) : "";
    const texto = foldText(a.texto);
    const estructura = contexto
      .map((n) => (n.nombre ? foldText(n.nombre) : ""))
      .filter((s) => s.length > 0);

    for (const t of tokens) {
      let hit = false;
      if (numero === t) {
        score += 50;
        matchedOn.add("numero");
        hit = true;
      }
      if (epigrafe.includes(t)) {
        score += 10;
        matchedOn.add("epigrafe");
        hit = true;
      }
      if (estructura.some((s) => s.includes(t))) {
        score += 4;
        matchedOn.add("estructura");
        hit = true;
      }
      if (texto.includes(t)) {
        score += 3;
        matchedOn.add("texto");
        hit = true;
      }
      if (!hit) score -= 0.5;
    }
    return { score: score > 0 ? score : 0, matchedOn: [...matchedOn] };
  }
}
