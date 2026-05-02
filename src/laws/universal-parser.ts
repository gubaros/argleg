/**
 * Universal parser for Argentine legal documents.
 *
 * Single piece of code that parses any tier defined in `hierarchy.ts`. The
 * caller declares the tier (mode "a"); the parser verifies that declaration
 * against InfoLEG-style header patterns (mode "b") and emits a warning on
 * mismatch.
 *
 * The output is uniform — `ParsedArticle[]` plus `ParsedStructureNode[]` —
 * regardless of the input tier. This is what `db-import` consumes.
 *
 * Design notes:
 *   - Article numbers are preserved as authored (`14bis`, `75 inc. 22`),
 *     normalised lazily downstream.
 *   - Structural levels nest according to their position in
 *     `TierProfile.niveles_posibles` (treated as outermost-to-innermost).
 *   - Special markers (`preambulo`, `considerandos`, `disposicion_transitoria`,
 *     `anexo`) reset the nesting stack — they do not nest under articles.
 *   - The article body is normalised: hard-wrapped soft newlines mid-sentence
 *     collapse to spaces; paragraph breaks (`\n\n`) are preserved.
 */

import { htmlToText } from "../scripts/parsers/base.js";
import {
  findIncoherentLevels,
  TIER_PROFILES,
  verifyTierAgainstText,
  type LegalTier,
  type StructuralLevel,
  type TierProfile,
} from "./hierarchy.js";

// ─── Public output types ─────────────────────────────────────────────────────

export interface ParsedStructureNode {
  /** Stable id derived from the chain of headers leading to this node. */
  id: string;
  /** Parent node id, or null for top-level. */
  parent_id: string | null;
  tipo: StructuralLevel;
  /** Display name (e.g., "Título I — Disposiciones generales"). */
  nombre: string;
  /** Document-order position. Useful for stable sorting. */
  orden: number;
}

export interface ParsedArticle {
  /** Number as authored: "1", "14bis", "8 bis", etc. */
  numero: string;
  /** Optional epígrafe, e.g. "Objeto" or "Definiciones". */
  epigrafe?: string;
  /** Body text with newlines normalised. Does not include the article header line. */
  texto: string;
  /** Document-order position among articles. */
  orden: number;
  /** IDs of structural nodes from outermost to innermost ancestor. */
  estructura_path: string[];
}

export interface ParseWarning {
  level: "info" | "warn";
  message: string;
}

export interface ParsedDocument {
  tier: LegalTier;
  articles: ParsedArticle[];
  structure: ParsedStructureNode[];
  warnings: ParseWarning[];
}

// ─── Detection patterns ──────────────────────────────────────────────────────

interface LevelDetector {
  regex: RegExp;
  buildName: (match: RegExpMatchArray) => string;
}

const SPANISH_ORDINAL_MASC =
  "PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO|UND[ÉE]CIMO|DUOD[ÉE]CIMO";
const SPANISH_ORDINAL_FEM =
  "PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[ÉE]PTIMA|OCTAVA|NOVENA|D[ÉE]CIMA|UND[ÉE]CIMA|DUOD[ÉE]CIMA";

const LEVEL_DETECTORS: Partial<Record<StructuralLevel, LevelDetector[]>> = {
  preambulo: [
    {
      regex: /^\s*PRE[ÁA]MBULO\b\s*[\-–—:]?\s*(.*)$/iu,
      buildName: (m) => (m[1]?.trim() ? `Preámbulo — ${m[1].trim()}` : "Preámbulo"),
    },
  ],
  parte: [
    {
      regex: new RegExp(`^\\s*(${SPANISH_ORDINAL_FEM})\\s+PARTE\\b\\s*[\\-–—:]?\\s*(.*)$`, "iu"),
      buildName: (m) => `${capitalize(m[1]!)} Parte${suffix(m[2])}`,
    },
    {
      regex: /^\s*PARTE\s+([\dIVXLC]+)\b\s*[\-–—:]?\s*(.*)$/iu,
      buildName: (m) => `Parte ${m[1]}${suffix(m[2])}`,
    },
  ],
  libro: [
    {
      regex: new RegExp(`^\\s*LIBRO\\s+(${SPANISH_ORDINAL_MASC})\\b\\s*[\\-–—:]?\\s*(.*)$`, "iu"),
      buildName: (m) => `Libro ${capitalize(m[1]!)}${suffix(m[2])}`,
    },
    {
      regex: /^\s*LIBRO\s+([\dIVXLC]+)\b\s*[\-–—:]?\s*(.*)$/iu,
      buildName: (m) => `Libro ${m[1]}${suffix(m[2])}`,
    },
  ],
  titulo: [
    {
      regex: /^\s*T[ÍI]TULO\s+PRELIMINAR\b\s*[\-–—:]?\s*(.*)$/iu,
      buildName: (m) => `Título Preliminar${suffix(m[1])}`,
    },
    {
      regex: new RegExp(`^\\s*T[ÍI]TULO\\s+(${SPANISH_ORDINAL_MASC})\\b\\s*[\\-–—:]?\\s*(.*)$`, "iu"),
      buildName: (m) => `Título ${capitalize(m[1]!)}${suffix(m[2])}`,
    },
    {
      regex: /^\s*T[ÍI]TULO\s+([\dIVXLC]+)\b\s*[\-–—:]?\s*(.*)$/iu,
      buildName: (m) => `Título ${m[1]}${suffix(m[2])}`,
    },
  ],
  capitulo: [
    {
      regex: new RegExp(`^\\s*CAP[ÍI]TULO\\s+(${SPANISH_ORDINAL_MASC})\\b\\s*[\\-–—:]?\\s*(.*)$`, "iu"),
      buildName: (m) => `Capítulo ${capitalize(m[1]!)}${suffix(m[2])}`,
    },
    {
      regex: /^\s*CAP[ÍI]TULO\s+([\dIVXLC]+)\b\s*[\-–—:]?\s*(.*)$/iu,
      buildName: (m) => `Capítulo ${m[1]}${suffix(m[2])}`,
    },
  ],
  seccion: [
    {
      regex: new RegExp(`^\\s*SECCI[ÓO]N\\s+(${SPANISH_ORDINAL_FEM})\\b\\s*[\\-–—:]?\\s*(.*)$`, "iu"),
      buildName: (m) => `Sección ${capitalize(m[1]!)}${suffix(m[2])}`,
    },
    {
      regex: /^\s*SECCI[ÓO]N\s+(\d+(?:[ªº])?|[IVXLC]+)\b\s*[\-–—:]?\s*(.*)$/iu,
      buildName: (m) => `Sección ${m[1]}${suffix(m[2])}`,
    },
  ],
  paragrafo: [
    {
      regex: /^\s*PAR[ÁA]GRAFO\s+(\d+[°º]?)\b\s*[\-–—:]?\s*(.*)$/iu,
      buildName: (m) => `Parágrafo ${m[1]}${suffix(m[2])}`,
    },
  ],
  anexo: [
    {
      regex: /^\s*ANEXO\s+([\dIVXLC]+|[A-Z])\b\s*[\-–—:]?\s*(.*)$/iu,
      buildName: (m) => `Anexo ${m[1]}${suffix(m[2])}`,
    },
  ],
  considerandos: [
    {
      regex: /^\s*(VISTO|CONSIDERANDO)\b\s*[:.]?\s*(.*)$/iu,
      buildName: (m) => capitalize(m[1]!.toLowerCase()),
    },
  ],
  disposicion_transitoria: [
    {
      regex:
        /^\s*DISPOSICI[ÓO]N(?:ES)?\s+(?:COMPLEMENTARIAS?\s+(?:Y\s+)?)?(?:TRANSITORIAS?|FINALES?)\b\s*[:.]?\s*(.*)$/iu,
      buildName: (m) => `Disposiciones Transitorias${suffix(m[1])}`,
    },
  ],
};

const ARTICLE_OPENER =
  /^\s*ART[ÍI]CULO\s+(\d+\s*[°º]?\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)?|\d+)[\s\-–—:.]+(.*)$/iu;

const RESETS_HIERARCHY = new Set<StructuralLevel>([
  "preambulo",
  "considerandos",
  "disposicion_transitoria",
  "anexo",
]);

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function suffix(extra: string | undefined): string {
  const t = extra?.trim();
  return t ? ` — ${t}` : "";
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseDocument(html: string, tier: LegalTier): ParsedDocument {
  const profile = TIER_PROFILES[tier];
  const text = htmlToText(html);
  const lines = text.split("\n");

  const warnings: ParseWarning[] = [];

  // Mode (b) verification
  const verification = verifyTierAgainstText(tier, text);
  if (verification.totalPatterns > 0 && !verification.matched) {
    warnings.push({
      level: "warn",
      message: `Declared tier '${tier}' has no header pattern matches in the document text.`,
    });
  }

  const stack: ParsedStructureNode[] = [];
  const nodes: ParsedStructureNode[] = [];
  const articles: ParsedArticle[] = [];
  let wip: WipArticle | null = null;
  let nodeOrder = 0;
  let articleOrder = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      // empty line — paragraph break inside the current article
      if (wip) wip.bodyLines.push("");
      continue;
    }

    // 1. Article opener?
    const articleMatch = line.match(ARTICLE_OPENER);
    if (articleMatch) {
      if (wip) articles.push(finalizeArticle(wip));
      const { numero, epigrafe, body } = extractArticleHeader(articleMatch[1]!, articleMatch[2] ?? "");
      wip = {
        numero,
        epigrafe,
        bodyLines: body ? [body] : [],
        orden: articleOrder++,
        estructura_path: stack.map((n) => n.id),
      };
      continue;
    }

    // 2. Structural header?
    const headerMatch = matchHeader(line, profile);
    if (headerMatch) {
      if (wip) {
        articles.push(finalizeArticle(wip));
        wip = null;
      }
      let parentId: string | null;
      if (RESETS_HIERARCHY.has(headerMatch.level)) {
        stack.length = 0;
        parentId = null;
      } else {
        const depth = depthOf(headerMatch.level, profile);
        while (stack.length > 0 && depthOf(stack[stack.length - 1]!.tipo, profile) >= depth) {
          stack.pop();
        }
        parentId = stack.length > 0 ? stack[stack.length - 1]!.id : null;
      }
      const node: ParsedStructureNode = {
        id: makeNodeId(headerMatch.level, headerMatch.nombre, nodeOrder),
        parent_id: parentId,
        tipo: headerMatch.level,
        nombre: headerMatch.nombre,
        orden: nodeOrder++,
      };
      nodes.push(node);
      if (!RESETS_HIERARCHY.has(headerMatch.level)) {
        stack.push(node);
      }
      continue;
    }

    // 3. Otherwise, append to current article body
    if (wip) wip.bodyLines.push(line);
  }

  if (wip) articles.push(finalizeArticle(wip));

  // Coherence check: did we detect any level that isn't allowed for this tier?
  const detectedLevels = [...new Set(nodes.map((n) => n.tipo))];
  for (const lvl of findIncoherentLevels(tier, detectedLevels)) {
    warnings.push({
      level: "warn",
      message: `Detected level '${lvl}' is not in niveles_posibles for tier '${tier}'.`,
    });
  }

  return { tier, articles, structure: nodes, warnings };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface WipArticle {
  numero: string;
  epigrafe?: string;
  bodyLines: string[];
  orden: number;
  estructura_path: string[];
}

function matchHeader(
  line: string,
  profile: TierProfile,
): { level: StructuralLevel; nombre: string } | null {
  for (const level of profile.niveles_posibles) {
    if (level === "articulo") continue;
    const detectors = LEVEL_DETECTORS[level];
    if (!detectors) continue;
    for (const det of detectors) {
      const m = line.match(det.regex);
      if (m) return { level, nombre: det.buildName(m).trim() };
    }
  }
  return null;
}

function depthOf(level: StructuralLevel, profile: TierProfile): number {
  const idx = profile.niveles_posibles.indexOf(level);
  return idx === -1 ? 999 : idx;
}

function extractArticleHeader(
  rawNum: string,
  rest: string,
): { numero: string; epigrafe?: string; body: string } {
  // Numero: keep authored form but trim and lower-case the suffix (bis/ter…)
  // and strip the ordinal mark.
  const numero = rawNum
    .replace(/[°º]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // If `rest` starts with a parenthetical, treat it as epígrafe.
  const parenMatch = rest.match(/^\((.*?)\)\.?\s*(.*)$/u);
  if (parenMatch) {
    return {
      numero,
      epigrafe: parenMatch[1]!.trim(),
      body: parenMatch[2]!.trim(),
    };
  }
  return { numero, body: rest.trim() };
}

function finalizeArticle(wip: WipArticle): ParsedArticle {
  return {
    numero: wip.numero,
    epigrafe: wip.epigrafe,
    texto: normalizeArticleText(wip.bodyLines.join("\n")),
    orden: wip.orden,
    estructura_path: wip.estructura_path,
  };
}

/**
 * Collapse soft-wrap newlines inside paragraphs.
 *
 * Rule: a single `\n` (not part of `\n\n`) that sits between two
 * lower-case-ish characters (or after a comma, semicolon, or open paren) is a
 * line wrap from the source HTML — replace with a space. Paragraph breaks
 * (`\n\n`) and post-sentence newlines (after `.`, `?`, `!`, `:`) are preserved.
 */
export function normalizeArticleText(text: string): string {
  let t = text.replace(/\r\n/g, "\n");
  // Collapse runs of 3+ newlines down to 2 (single paragraph break).
  t = t.replace(/\n{3,}/g, "\n\n");
  // Mid-sentence wrap: prev char is letter/comma/semi/open-paren AND next char
  // is a lowercase letter or digit (no sentence boundary signal).
  t = t.replace(
    /([A-Za-zÁÉÍÓÚÑÜáéíóúñü,;()])\n(?!\n)([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9])/gu,
    (_match, prev: string, next: string) => {
      // If `next` is uppercase, this could be a sentence start; only collapse
      // when prev is NOT a sentence terminator (we already excluded . ? ! : in
      // the character class). Lowercase next is always a wrap.
      return `${prev} ${next}`;
    },
  );
  return t.trim();
}

function makeNodeId(level: StructuralLevel, nombre: string, orden: number): string {
  return `${level}__${slugify(nombre)}__${orden}`;
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
