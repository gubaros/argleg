/**
 * Pirámide normativa argentina.
 *
 * Sigue art. 31 CN (supremacía federal) + art. 75.22 CN (jerarquía
 * constitucional para tratados de DDHH) + práctica constitucional vigente.
 *
 * Cada `tier` define:
 *  - su lugar en la pirámide kelseniana (1 = supremo)
 *  - su ámbito territorial (federal / provincial / municipal)
 *  - el órgano emisor habilitado
 *  - su base constitucional, cuando corresponde
 *  - los niveles estructurales que un documento de ese tier puede contener
 *  - patrones de header que el universal parser usa en modo verificación:
 *    el operador declara el tier, el parser corrobora contra el HTML real
 *
 * El `TIER_BY_NORMA_ID` mapea cada norma del corpus actual a su tier.
 *
 * Esta es la fuente de verdad jerárquica. Toda nueva tier o nueva norma
 * pasa por acá; el ingest, el parser y el validador se referencian a este
 * módulo y no inventan datos por su cuenta.
 */
import { z } from "zod";

// ─── Tier identifiers ────────────────────────────────────────────────────────

const LEGAL_TIER_VALUES = [
  // Tier 1 — bloque constitucional federal
  "constitucion_nacional",
  "tratado_constitucional",
  // Tier 2 — tratados generales
  "tratado_internacional",
  // Tier 3 — leyes federales
  "codigo_fondo",
  "codigo_procesal_federal",
  "ley_federal",
  // Tier 4 — actos del PEN con rango cuasi-legal
  "dnu",
  "decreto_delegado",
  // Tier 5 — decretos PEN
  "decreto_pen",
  // Tier 6 — actos administrativos federales
  "resolucion_ministerial",
  "disposicion_organismo",
  // Tier 7 — constituciones provinciales (y CABA, art 129 CN)
  "constitucion_provincial",
  "constitucion_caba",
  // Tier 8+ — leyes y decretos provinciales
  "ley_provincial",
  "decreto_provincial",
  // Tier 10 — municipal
  "ordenanza_municipal",
] as const;

export type LegalTier = (typeof LEGAL_TIER_VALUES)[number];

export const ALL_LEGAL_TIERS: readonly LegalTier[] = LEGAL_TIER_VALUES;

export const LegalTierSchema = z.enum(LEGAL_TIER_VALUES);

// ─── Structural levels ───────────────────────────────────────────────────────

const STRUCTURAL_LEVEL_VALUES = [
  "preambulo",
  "parte",
  "libro",
  "seccion",
  "titulo",
  "capitulo",
  "subcapitulo",
  "paragrafo",
  "articulo",
  "anexo",
  "considerandos",
  "disposicion_transitoria",
] as const;

export type StructuralLevel = (typeof STRUCTURAL_LEVEL_VALUES)[number];

export const ALL_STRUCTURAL_LEVELS: readonly StructuralLevel[] = STRUCTURAL_LEVEL_VALUES;

export const StructuralLevelSchema = z.enum(STRUCTURAL_LEVEL_VALUES);

// ─── Tier profile ────────────────────────────────────────────────────────────

export type Ambito = "federal" | "provincial" | "municipal";

export interface TierProfile {
  tier: LegalTier;
  /** 1 = supremo. Sólo orienta; no impone aritmética sobre la pirámide real. */
  jerarquia_kelsen: number;
  ambito: Ambito;
  emisor: string;
  /** Cláusula constitucional habilitante (cuando aplica). */
  base_constitucional?: string;
  /** Subset de StructuralLevel que es válido en un documento de este tier. */
  niveles_posibles: readonly StructuralLevel[];
  /** Niveles que se esperan en la mayoría de los documentos del tier. */
  niveles_tipicos: readonly StructuralLevel[];
  /**
   * Patrones que, presentes en el texto, confirman el tier declarado.
   * Si la lista está vacía, el verificador acepta la declaración del operador
   * sin oponer evidencia.
   */
  patrones_header: readonly RegExp[];
  /** Descripción breve para tooling, docs y mensajes de error. */
  descripcion: string;
}

export const TIER_PROFILES: Record<LegalTier, TierProfile> = {
  // ── Tier 1 ──────────────────────────────────────────────────────────────
  constitucion_nacional: {
    tier: "constitucion_nacional",
    jerarquia_kelsen: 1,
    ambito: "federal",
    emisor: "Convención Constituyente",
    niveles_posibles: [
      "preambulo",
      "parte",
      "titulo",
      "seccion",
      "capitulo",
      "articulo",
      "disposicion_transitoria",
    ],
    niveles_tipicos: ["parte", "capitulo", "articulo"],
    patrones_header: [
      /^\s*PREÁMBULO\b/imu,
      /^\s*PRIMERA\s+PARTE\b/imu,
      /^\s*SEGUNDA\s+PARTE\b/imu,
      /\bConstituci[óo]n\s+de\s+la\s+Naci[óo]n\s+Argentina\b/iu,
    ],
    descripcion:
      "Norma suprema del ordenamiento jurídico argentino (art. 31 CN). Reformada por última vez en 1994.",
  },

  tratado_constitucional: {
    tier: "tratado_constitucional",
    jerarquia_kelsen: 1,
    ambito: "federal",
    emisor: "Tratado internacional con jerarquía constitucional",
    base_constitucional: "art. 75.22 CN",
    niveles_posibles: ["preambulo", "parte", "titulo", "capitulo", "seccion", "articulo"],
    niveles_tipicos: ["parte", "articulo"],
    patrones_header: [],
    descripcion:
      "Tratado internacional de DDHH con jerarquía constitucional (los listados en art. 75.22, segundo párrafo CN, y los que el Congreso eleve a esa jerarquía).",
  },

  // ── Tier 2 ──────────────────────────────────────────────────────────────
  tratado_internacional: {
    tier: "tratado_internacional",
    jerarquia_kelsen: 2,
    ambito: "federal",
    emisor: "Congreso aprueba; PEN ratifica",
    base_constitucional: "art. 75.22 CN",
    niveles_posibles: ["preambulo", "parte", "titulo", "capitulo", "articulo", "anexo"],
    niveles_tipicos: ["articulo"],
    patrones_header: [],
    descripcion:
      "Tratado internacional con jerarquía supralegal pero infraconstitucional (art. 75.22, primer párrafo CN).",
  },

  // ── Tier 3 ──────────────────────────────────────────────────────────────
  codigo_fondo: {
    tier: "codigo_fondo",
    jerarquia_kelsen: 3,
    ambito: "federal",
    emisor: "Congreso de la Nación",
    base_constitucional: "art. 75.12 CN",
    niveles_posibles: [
      "libro",
      "titulo",
      "capitulo",
      "seccion",
      "subcapitulo",
      "paragrafo",
      "articulo",
      "disposicion_transitoria",
    ],
    niveles_tipicos: ["libro", "titulo", "capitulo", "articulo"],
    patrones_header: [
      /^\s*LIBRO\s+(PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO)\b/imu,
      /^\s*T[ÍI]TULO\s+PRELIMINAR\b/imu,
    ],
    descripcion:
      "Código de fondo dictado por el Congreso bajo art. 75.12 CN (CCyC, Penal, etc.). Aplicable en todo el territorio.",
  },

  codigo_procesal_federal: {
    tier: "codigo_procesal_federal",
    jerarquia_kelsen: 3,
    ambito: "federal",
    emisor: "Congreso de la Nación",
    niveles_posibles: [
      "libro",
      "parte",
      "titulo",
      "capitulo",
      "seccion",
      "articulo",
      "disposicion_transitoria",
    ],
    niveles_tipicos: ["libro", "titulo", "capitulo", "articulo"],
    patrones_header: [
      /^\s*LIBRO\s+(PRIMERO|SEGUNDO|TERCERO|CUARTO)\b/imu,
      /\bC[óo]digo\s+Procesal\b/iu,
    ],
    descripcion:
      "Código procesal de aplicación federal (CPCCN, CPPF). Regula procedimiento ante tribunales federales.",
  },

  ley_federal: {
    tier: "ley_federal",
    jerarquia_kelsen: 3,
    ambito: "federal",
    emisor: "Congreso de la Nación",
    niveles_posibles: [
      "titulo",
      "capitulo",
      "seccion",
      "articulo",
      "anexo",
      "disposicion_transitoria",
    ],
    niveles_tipicos: ["capitulo", "articulo"],
    patrones_header: [
      /\bLey\s+(N[°º]?\s*)?[\d.]+\b/iu,
      /^\s*T[ÍI]TULO\s+(PRIMERO|I|II|III|IV|V)\b/imu,
      /^\s*CAP[ÍI]TULO\s+(PRIMERO|I|II|III|IV|V)\b/imu,
    ],
    descripcion:
      "Ley federal ordinaria sancionada por el Congreso de la Nación.",
  },

  // ── Tier 4 ──────────────────────────────────────────────────────────────
  dnu: {
    tier: "dnu",
    jerarquia_kelsen: 4,
    ambito: "federal",
    emisor: "Poder Ejecutivo Nacional",
    base_constitucional: "art. 99.3 CN",
    niveles_posibles: ["considerandos", "articulo", "anexo"],
    niveles_tipicos: ["considerandos", "articulo"],
    patrones_header: [
      /\bDecreto\s+de\s+Necesidad\s+y\s+Urgencia\b/iu,
      /\bDNU\s+\d+\/\d+\b/iu,
      /\bart[íi]culo\s+99,?\s*inc(?:iso)?\.?\s*3\b/iu,
    ],
    descripcion:
      "Decreto de Necesidad y Urgencia (art. 99.3 CN). Sujeto a control de la Comisión Bicameral Permanente y ratificación legislativa.",
  },

  decreto_delegado: {
    tier: "decreto_delegado",
    jerarquia_kelsen: 4,
    ambito: "federal",
    emisor: "Poder Ejecutivo Nacional",
    base_constitucional: "art. 76 CN",
    niveles_posibles: ["considerandos", "articulo", "anexo"],
    niveles_tipicos: ["considerandos", "articulo"],
    patrones_header: [
      /\bdelegaci[óo]n\s+legislativa\b/iu,
      /\bart[íi]culo\s+76\b/iu,
    ],
    descripcion:
      "Decreto delegado dictado por el PEN bajo delegación legislativa (art. 76 CN). Limitado a materias determinadas y plazo.",
  },

  // ── Tier 5 ──────────────────────────────────────────────────────────────
  decreto_pen: {
    tier: "decreto_pen",
    jerarquia_kelsen: 5,
    ambito: "federal",
    emisor: "Poder Ejecutivo Nacional",
    base_constitucional: "art. 99 CN (incs. 1 y 2)",
    niveles_posibles: ["considerandos", "articulo", "anexo"],
    niveles_tipicos: ["articulo"],
    patrones_header: [
      /^\s*Decreto\s+(N[°º]?\s*)?\d+\/\d+\b/imu,
      /\bart[íi]culo\s+99,?\s*inc(?:iso)?\.?\s*[12]\b/iu,
    ],
    descripcion:
      "Decreto del PEN, sea reglamentario (art. 99.2 CN) o autónomo (art. 99.1 CN).",
  },

  // ── Tier 6 ──────────────────────────────────────────────────────────────
  resolucion_ministerial: {
    tier: "resolucion_ministerial",
    jerarquia_kelsen: 6,
    ambito: "federal",
    emisor: "Ministerio del PEN",
    niveles_posibles: ["considerandos", "articulo", "anexo"],
    niveles_tipicos: ["articulo"],
    patrones_header: [/^\s*Resoluci[óo]n\s+(N[°º]?\s*)?\d+\/\d+\b/imu],
    descripcion:
      "Resolución ministerial. Reglamenta dentro del ámbito de competencia del ministerio emisor.",
  },

  disposicion_organismo: {
    tier: "disposicion_organismo",
    jerarquia_kelsen: 6,
    ambito: "federal",
    emisor: "Organismo descentralizado, autárquico o regulador",
    niveles_posibles: ["considerandos", "articulo", "anexo"],
    niveles_tipicos: ["articulo"],
    patrones_header: [/^\s*Disposici[óo]n\s+(N[°º]?\s*)?\d+\/\d+\b/imu],
    descripcion:
      "Disposición de organismo descentralizado, autárquico o regulador (AFIP, ANMAT, ENACOM, etc.).",
  },

  // ── Tier 7+ provincial ──────────────────────────────────────────────────
  constitucion_provincial: {
    tier: "constitucion_provincial",
    jerarquia_kelsen: 7,
    ambito: "provincial",
    emisor: "Convención Constituyente provincial",
    niveles_posibles: [
      "preambulo",
      "parte",
      "titulo",
      "seccion",
      "capitulo",
      "articulo",
      "disposicion_transitoria",
    ],
    niveles_tipicos: ["parte", "capitulo", "articulo"],
    patrones_header: [/\bConstituci[óo]n\s+de\s+la\s+Provincia\b/iu],
    descripcion:
      "Norma suprema en el ámbito provincial. Subordinada a la CN (arts. 5 y 31 CN).",
  },

  constitucion_caba: {
    tier: "constitucion_caba",
    jerarquia_kelsen: 7,
    ambito: "provincial",
    emisor: "Convención Constituyente de la Ciudad Autónoma de Buenos Aires",
    base_constitucional: "art. 129 CN (reforma 1994)",
    niveles_posibles: [
      "preambulo",
      "libro",
      "titulo",
      "capitulo",
      "seccion",
      "articulo",
      "disposicion_transitoria",
    ],
    niveles_tipicos: ["libro", "titulo", "capitulo", "articulo"],
    patrones_header: [
      /\bConstituci[óo]n\s+de\s+la\s+Ciudad\s+(?:Aut[óo]noma\s+)?de\s+Buenos\s+Aires\b/iu,
    ],
    descripcion:
      "Constitución de la Ciudad Autónoma de Buenos Aires (1996). CABA tiene autonomía propia (art. 129 CN); su régimen es asimilable al provincial pero no idéntico.",
  },

  ley_provincial: {
    tier: "ley_provincial",
    jerarquia_kelsen: 8,
    ambito: "provincial",
    emisor: "Legislatura provincial",
    niveles_posibles: ["titulo", "capitulo", "seccion", "articulo", "anexo"],
    niveles_tipicos: ["articulo"],
    patrones_header: [/\bLey\s+(Provincial|N[°º])\b/iu],
    descripcion: "Ley sancionada por la legislatura provincial.",
  },

  decreto_provincial: {
    tier: "decreto_provincial",
    jerarquia_kelsen: 9,
    ambito: "provincial",
    emisor: "Poder Ejecutivo provincial",
    niveles_posibles: ["considerandos", "articulo", "anexo"],
    niveles_tipicos: ["articulo"],
    patrones_header: [/^\s*Decreto\s+(Provincial|N[°º])\b/imu],
    descripcion: "Decreto del Poder Ejecutivo provincial.",
  },

  // ── Tier 10 municipal ───────────────────────────────────────────────────
  ordenanza_municipal: {
    tier: "ordenanza_municipal",
    jerarquia_kelsen: 10,
    ambito: "municipal",
    emisor: "Concejo Deliberante",
    niveles_posibles: ["titulo", "capitulo", "articulo", "anexo"],
    niveles_tipicos: ["articulo"],
    patrones_header: [/\bOrdenanza\s+(N[°º]?\s*)?\d+\b/iu],
    descripcion: "Norma municipal sancionada por el Concejo Deliberante.",
  },
};

// ─── Corpus mapping ──────────────────────────────────────────────────────────

/**
 * Cada norma del corpus declarada con su tier. Agregar una nueva norma al
 * corpus requiere también una entrada acá.
 *
 * Las constituciones provinciales y la de CABA están declaradas como
 * jurisdicciones en scope, aunque la ingesta de cada texto se hace de forma
 * incremental (cada provincia tiene su portal y su HTML; ver
 * docs/provincial-constitutions.md para fuentes y workflow).
 */
export const TIER_BY_NORMA_ID: Record<string, LegalTier> = {
  // ── Federal ─────────────────────────────────────────────────────────────
  constitucion: "constitucion_nacional",
  ccyc: "codigo_fondo",
  penal: "codigo_fondo",
  cppf: "codigo_procesal_federal",
  cpccn: "codigo_procesal_federal",
  ley_24240: "ley_federal",
  ley_19549: "ley_federal",
  ley_19550: "ley_federal",
  ley_25326: "ley_federal",

  // ── Constituciones provinciales (23 provincias) ────────────────────────
  constitucion_buenos_aires: "constitucion_provincial",
  constitucion_catamarca: "constitucion_provincial",
  constitucion_chaco: "constitucion_provincial",
  constitucion_chubut: "constitucion_provincial",
  constitucion_cordoba: "constitucion_provincial",
  constitucion_corrientes: "constitucion_provincial",
  constitucion_entre_rios: "constitucion_provincial",
  constitucion_formosa: "constitucion_provincial",
  constitucion_jujuy: "constitucion_provincial",
  constitucion_la_pampa: "constitucion_provincial",
  constitucion_la_rioja: "constitucion_provincial",
  constitucion_mendoza: "constitucion_provincial",
  constitucion_misiones: "constitucion_provincial",
  constitucion_neuquen: "constitucion_provincial",
  constitucion_rio_negro: "constitucion_provincial",
  constitucion_salta: "constitucion_provincial",
  constitucion_san_juan: "constitucion_provincial",
  constitucion_san_luis: "constitucion_provincial",
  constitucion_santa_cruz: "constitucion_provincial",
  constitucion_santa_fe: "constitucion_provincial",
  constitucion_santiago_del_estero: "constitucion_provincial",
  constitucion_tierra_del_fuego: "constitucion_provincial",
  constitucion_tucuman: "constitucion_provincial",

  // ── Ciudad Autónoma de Buenos Aires (art. 129 CN) ──────────────────────
  constitucion_caba: "constitucion_caba",
};

// ─── Norma id canonicalization & suggestion ────────────────────────────────
//
// El catálogo `TIER_BY_NORMA_ID` es la fuente de verdad de los identificadores
// canónicos. Cualquier input que llegue a las tools del MCP se compara contra
// estas keys; si el LLM cliente prueba una variante razonable (mayúsculas,
// espacios, puntos en el número, diacríticos), normalizamos lossless. Si la
// canonicalización falla, `suggestNormaId` busca un único candidato cercano
// para devolver "¿quisiste decir X?" — política conservadora: 0 ó >1 matches
// devuelven null para no fabular.

function foldDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Devuelve el id canónico para un input dado, si y solo si una transformación
 * lossless (case-fold + strip diacritics + normalizar separadores) lo lleva a
 * una key existente en `TIER_BY_NORMA_ID`. Si no, null.
 *
 * No infiere tipo: `"19549"` (sin prefijo) no se mapea a `"ley_19549"` —
 * para esos casos `suggestNormaId` da la pista.
 */
export function canonicalNormaId(raw: string): string | null {
  if (!raw) return null;
  const folded = foldDiacritics(raw).trim().toLowerCase();
  if (folded.length === 0) return null;
  if (folded in TIER_BY_NORMA_ID) return folded;

  const normalized = folded
    // Punctuation between digits is number formatting ("19.549" → "19549").
    .replace(/(?<=\d)[.,](?=\d)/g, "")
    // Anything else (whitespace, dashes, leftover dots/commas) is a separator.
    .replace(/[\s\-.,]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return normalized in TIER_BY_NORMA_ID ? normalized : null;
}

/**
 * Cuando un input no canonicaliza, intenta encontrar un único id candidato
 * cuya forma alfanumérica contenga la del input. Devuelve null si no hay
 * match o si hay ambigüedad (≥2 matches).
 */
export function suggestNormaId(raw: string): string | null {
  if (!raw) return null;
  const keys = Object.keys(TIER_BY_NORMA_ID);

  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length >= 4) {
    const matches = keys.filter((k) => k.includes(digits));
    if (matches.length === 1) return matches[0]!;
  }

  const alphanum = foldDiacritics(raw).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (alphanum.length >= 4) {
    const matches = keys.filter((k) => k.replace(/[^a-z0-9]/g, "").includes(alphanum));
    if (matches.length === 1) return matches[0]!;
  }

  return null;
}

/**
 * Catálogo declarativo de provincias argentinas, con metadata útil para el
 * fetch e ingest de sus respectivas constituciones. URLs apuntan a fuentes
 * oficiales (portal provincial o SAIJ); pueden cambiar y deben verificarse
 * antes de cada ingest.
 */
export interface ProvinciaInfo {
  id: string;
  nombre_provincia: string;
  /** ID que usa esta provincia en el corpus para su constitución. */
  norma_id: string;
  tier: LegalTier;
  /** URL canónica del texto consolidado, si la conocemos. */
  fuente_url?: string;
  /** Notas adicionales: año de última reforma, particularidades. */
  notas?: string;
}

export const PROVINCIAS: readonly ProvinciaInfo[] = [
  {
    id: "buenos_aires",
    nombre_provincia: "Buenos Aires",
    norma_id: "constitucion_buenos_aires",
    tier: "constitucion_provincial",
    fuente_url: "https://www.gob.gba.gov.ar/legislacion/constitucion/cpcomp.htm",
    notas: "Última reforma: 1994.",
  },
  {
    id: "catamarca",
    nombre_provincia: "Catamarca",
    norma_id: "constitucion_catamarca",
    tier: "constitucion_provincial",
    notas: "Última reforma: 1988.",
  },
  {
    id: "chaco",
    nombre_provincia: "Chaco",
    norma_id: "constitucion_chaco",
    tier: "constitucion_provincial",
    notas: "Última reforma: 1994.",
  },
  {
    id: "chubut",
    nombre_provincia: "Chubut",
    norma_id: "constitucion_chubut",
    tier: "constitucion_provincial",
    notas: "Sancionada en 1994.",
  },
  {
    id: "cordoba",
    nombre_provincia: "Córdoba",
    norma_id: "constitucion_cordoba",
    tier: "constitucion_provincial",
    notas: "Última reforma: 2001.",
  },
  {
    id: "corrientes",
    nombre_provincia: "Corrientes",
    norma_id: "constitucion_corrientes",
    tier: "constitucion_provincial",
    notas: "Última reforma: 2007.",
  },
  {
    id: "entre_rios",
    nombre_provincia: "Entre Ríos",
    norma_id: "constitucion_entre_rios",
    tier: "constitucion_provincial",
    notas: "Última reforma: 2008.",
  },
  {
    id: "formosa",
    nombre_provincia: "Formosa",
    norma_id: "constitucion_formosa",
    tier: "constitucion_provincial",
    notas: "Última reforma: 2003.",
  },
  {
    id: "jujuy",
    nombre_provincia: "Jujuy",
    norma_id: "constitucion_jujuy",
    tier: "constitucion_provincial",
    notas: "Sancionada en 1986.",
  },
  {
    id: "la_pampa",
    nombre_provincia: "La Pampa",
    norma_id: "constitucion_la_pampa",
    tier: "constitucion_provincial",
    notas: "Última reforma: 1994.",
  },
  {
    id: "la_rioja",
    nombre_provincia: "La Rioja",
    norma_id: "constitucion_la_rioja",
    tier: "constitucion_provincial",
    notas: "Última reforma: 2008.",
  },
  {
    id: "mendoza",
    nombre_provincia: "Mendoza",
    norma_id: "constitucion_mendoza",
    tier: "constitucion_provincial",
    notas: "Sancionada en 1916, con reformas posteriores.",
  },
  {
    id: "misiones",
    nombre_provincia: "Misiones",
    norma_id: "constitucion_misiones",
    tier: "constitucion_provincial",
    notas: "Sancionada en 1958.",
  },
  {
    id: "neuquen",
    nombre_provincia: "Neuquén",
    norma_id: "constitucion_neuquen",
    tier: "constitucion_provincial",
    notas: "Última reforma: 2006.",
  },
  {
    id: "rio_negro",
    nombre_provincia: "Río Negro",
    norma_id: "constitucion_rio_negro",
    tier: "constitucion_provincial",
    notas: "Última reforma: 1988.",
  },
  {
    id: "salta",
    nombre_provincia: "Salta",
    norma_id: "constitucion_salta",
    tier: "constitucion_provincial",
    notas: "Última reforma: 1998.",
  },
  {
    id: "san_juan",
    nombre_provincia: "San Juan",
    norma_id: "constitucion_san_juan",
    tier: "constitucion_provincial",
    notas: "Sancionada en 1986.",
  },
  {
    id: "san_luis",
    nombre_provincia: "San Luis",
    norma_id: "constitucion_san_luis",
    tier: "constitucion_provincial",
    notas: "Última reforma: 1987 (texto ordenado).",
  },
  {
    id: "santa_cruz",
    nombre_provincia: "Santa Cruz",
    norma_id: "constitucion_santa_cruz",
    tier: "constitucion_provincial",
    notas: "Última reforma: 1998.",
  },
  {
    id: "santa_fe",
    nombre_provincia: "Santa Fe",
    norma_id: "constitucion_santa_fe",
    tier: "constitucion_provincial",
    notas: "Sancionada en 1962.",
  },
  {
    id: "santiago_del_estero",
    nombre_provincia: "Santiago del Estero",
    norma_id: "constitucion_santiago_del_estero",
    tier: "constitucion_provincial",
    notas: "Última reforma: 2005.",
  },
  {
    id: "tierra_del_fuego",
    nombre_provincia: "Tierra del Fuego, Antártida e Islas del Atlántico Sur",
    norma_id: "constitucion_tierra_del_fuego",
    tier: "constitucion_provincial",
    notas: "Sancionada en 1991.",
  },
  {
    id: "tucuman",
    nombre_provincia: "Tucumán",
    norma_id: "constitucion_tucuman",
    tier: "constitucion_provincial",
    notas: "Última reforma: 2006.",
  },
  {
    id: "caba",
    nombre_provincia: "Ciudad Autónoma de Buenos Aires",
    norma_id: "constitucion_caba",
    tier: "constitucion_caba",
    fuente_url: "https://www.buenosaires.gob.ar/areas/leg_tecnica/sin/normapop09.php?id=26766",
    notas:
      "Sancionada en 1996. Status especial: ciudad autónoma con régimen propio (art. 129 CN).",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Modo (b) verificación: dado un texto y un tier declarado, devuelve cuántos
 * de los `patrones_header` del tier están presentes. `matched` es `true` si:
 *  - hay al menos un match, o
 *  - el tier no define patrones (no hay forma de verificar — confiamos).
 *
 * El parser usa esto para alertar si el tier declarado por el operador no
 * encaja con la evidencia textual.
 */
export function verifyTierAgainstText(
  tier: LegalTier,
  text: string,
): { matched: boolean; matchedPatterns: number; totalPatterns: number } {
  const profile = TIER_PROFILES[tier];
  let matched = 0;
  for (const re of profile.patrones_header) {
    if (re.test(text)) matched++;
  }
  return {
    matched: matched > 0 || profile.patrones_header.length === 0,
    matchedPatterns: matched,
    totalPatterns: profile.patrones_header.length,
  };
}

/**
 * Coherence check: dado un tier y la lista de niveles que el parser detectó,
 * devuelve los que NO son válidos para ese tier. Lista vacía = todo OK.
 */
export function findIncoherentLevels(
  tier: LegalTier,
  detectedLevels: readonly StructuralLevel[],
): StructuralLevel[] {
  const allowed = new Set(TIER_PROFILES[tier].niveles_posibles);
  return detectedLevels.filter((l) => !allowed.has(l));
}

/**
 * Devuelve todos los tiers de un ámbito dado, ordenados por jerarquía
 * kelseniana ascendente (el más alto primero).
 */
export function tiersByAmbito(ambito: Ambito): TierProfile[] {
  return Object.values(TIER_PROFILES)
    .filter((p) => p.ambito === ambito)
    .sort((a, b) => a.jerarquia_kelsen - b.jerarquia_kelsen);
}
