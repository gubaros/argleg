import type { Article, Law, LawId } from "./types.js";
import type { LegalTier } from "./hierarchy.js";

/**
 * Domain types for the SQLite-backed repository.
 *
 * The Spanish field names mirror the SQL schema (see src/db/schema.sql) so
 * the boundary between Norma rows and the rest of the codebase stays
 * mechanical and easy to inspect. The legacy `Law` / `Article` shapes are
 * still useful for `formatArticle()` / `formatLawSummary()`, so the repo
 * exposes adapters that build them on demand.
 */

export interface Norma {
  id: string;
  tier: LegalTier;
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
  materias: string[] | null;
  notas: string | null;
}

/** Aggregated structural metrics computed from `estructura_normativa`. */
export interface ResumenEstructural {
  niveles: string[];
  tiene_titulos: boolean;
  tiene_capitulos: boolean;
  tiene_secciones: boolean;
  tiene_libros: boolean;
  tiene_partes: boolean;
  tiene_inciso: boolean;
  cantidad_articulos: number;
  cantidad_titulos: number;
  cantidad_capitulos: number;
  cantidad_secciones: number;
  profundidad_maxima: number;
}

export interface NormaConResumen extends Norma {
  resumen_estructural: ResumenEstructural;
}

export interface ArticuloRow {
  id: string;
  norma_id: string;
  numero: string;
  texto: string;
  orden: number;
  epigrafe: string | null;
}

export interface EstructuraNodo {
  id: string;
  norma_id: string;
  parent_id: string | null;
  tipo: string;
  nombre: string | null;
  orden: number;
}

export interface ArticuloConContexto {
  articulo: ArticuloRow;
  norma: Norma;
  contexto_estructural: EstructuraNodo[];
}

export interface SearchHitRow {
  norma_id: string;
  norma_titulo: string;
  norma_nombre_corto: string | null;
  articulo: ArticuloRow;
  contexto_estructural: EstructuraNodo[];
  score: number;
  matched_on: Array<"numero" | "epigrafe" | "texto" | "estructura">;
}

export interface ListNormsFilter {
  tier?: LegalTier;
  materia?: string;
  estado_vigencia?: string;
}

export interface SearchOptions {
  norma_id?: string;
  limit?: number;
}

// ─── Intelligence layer types ────────────────────────────────────────────────

export interface RamaDerecho {
  id: string;
  nombre: string;
  descripcion: string | null;
  ambito: "publico" | "privado" | "social" | "mixto";
  es_codificada: boolean;
}

export interface PrincipioJuridico {
  id: string;
  rama_id: string;
  nombre: string;
  enunciado: string;
  fuente: string | null;
  vigencia: "dogmatico" | "positivado" | "controvertido";
}

export interface NormaPorRama {
  norma_id: string;
  rama_id: string;
  relevancia: "nuclear" | "complementaria" | "tangencial";
}

export interface DoctrinaEntry {
  id: string;
  autor: string;
  obra: string;
  ano_publicacion: number | null;
  rama_id: string | null;
  tipo: string;
  citacion: string | null;
  notas: string | null;
}

export interface JurisprudenciaEntry {
  id: string;
  caratula: string;
  tribunal: string;
  fecha: string | null;
  fallo_tipo: string | null;
  doctrina_extraida: string | null;
  rama_id: string | null;
  fuente: string | null;
}

export interface RamaConContenido {
  rama: RamaDerecho;
  principios: PrincipioJuridico[];
  normas: Array<{ norma: Norma; relevancia: NormaPorRama["relevancia"] }>;
  doctrina: DoctrinaEntry[];
  /** Empty until jurisprudencia is populated. */
  jurisprudencia: JurisprudenciaEntry[];
}

/** A node from `estructura_normativa` with its contained articles range. */
export interface SeccionConArticulos {
  nodo: EstructuraNodo;
  /** All ancestors from root to this node's parent, in order. */
  ancestros: EstructuraNodo[];
  /** Articles directly attached to this node. */
  articulos: ArticuloRow[];
  /** Range of article numbers (first ↔ last) for quick display. */
  rango: { primero: string; ultimo: string } | null;
}

// ─── Repository contract ─────────────────────────────────────────────────────

export interface LegalRepository {
  listNorms(filter?: ListNormsFilter): Norma[];
  getNormMetadata(normaId: string): NormaConResumen | undefined;
  getArticle(normaId: string, articleNumber: string): ArticuloConContexto | undefined;
  searchArticles(query: string, opts?: SearchOptions): SearchHitRow[];
  getNormStructure(normaId: string): EstructuraNodo[];
  /** All articles of a norma in order. Used by formatLawSummary and resource listings. */
  listArticles(normaId: string): ArticuloRow[];
  /** Look up a structural node by norma + identifier (slug or display name fragment). */
  getSection(normaId: string, identificador: string): SeccionConArticulos | undefined;

  // Intelligence layer (read-only). Lazy: only the methods needed by tools.
  listRamas(): RamaDerecho[];
  getRamaConContenido(ramaId: string): RamaConContenido | undefined;
  /** All ramas a given norma applies to. */
  getRamasDeNorma(normaId: string): Array<{ rama: RamaDerecho; relevancia: NormaPorRama["relevancia"] }>;

  close(): void;
}

// ─── Adapters: rebuild legacy Law/Article shapes for format.ts compatibility ──

export function articuloToArticle(row: ArticuloRow, contexto: EstructuraNodo[]): Article {
  // Map estructura nodes into the Article.location shape (libro/parte/titulo/capitulo/seccion).
  const loc: Article["location"] = {};
  for (const node of contexto) {
    switch (node.tipo) {
      case "libro":
        if (node.nombre) loc.libro = node.nombre;
        break;
      case "parte":
        if (node.nombre) loc.parte = node.nombre;
        break;
      case "titulo":
        if (node.nombre) loc.titulo = node.nombre;
        break;
      case "capitulo":
        if (node.nombre) loc.capitulo = node.nombre;
        break;
      case "seccion":
        if (node.nombre) loc.seccion = node.nombre;
        break;
    }
  }
  return {
    number: row.numero,
    title: row.epigrafe ?? undefined,
    text: row.texto,
    incisos: [],
    location: loc,
    materia: [],
  };
}

export function normaToLaw(n: Norma, articulos: ArticuloRow[], structureLookup: Map<string, EstructuraNodo[]>): Law {
  return {
    id: n.id as LawId,
    title: n.titulo,
    shortName: n.nombre_corto ?? n.id,
    officialNumber: n.numero ? buildOfficialNumber(n) : undefined,
    source: n.fuente_url ?? "",
    lastUpdated: n.fecha_ultima_actualizacion ?? "",
    description: n.notas ?? undefined,
    articles: articulos.map((a) => articuloToArticle(a, structureLookup.get(a.id) ?? [])),
  };
}

function buildOfficialNumber(n: Norma): string | undefined {
  if (!n.numero) return undefined;
  // Reconstruct conventional Spanish formatting based on the tier.
  switch (n.tier) {
    case "constitucion_nacional":
    case "constitucion_provincial":
    case "constitucion_caba":
      return n.numero; // already a free-form label
    case "codigo_fondo":
    case "codigo_procesal_federal":
    case "ley_federal":
    case "ley_provincial":
      return `Ley ${n.numero}`;
    case "dnu":
    case "decreto_delegado":
    case "decreto_pen":
    case "decreto_provincial":
      return `Decreto ${n.numero}`;
    case "resolucion_ministerial":
      return `Resolución ${n.numero}`;
    case "disposicion_organismo":
      return `Disposición ${n.numero}`;
    case "ordenanza_municipal":
      return `Ordenanza ${n.numero}`;
    case "tratado_constitucional":
    case "tratado_internacional":
      return n.numero;
    default:
      return n.numero;
  }
}
