/**
 * Detect and strip structural-header lines from already-parsed article text.
 *
 * The legacy per-law parsers (still the source of our `data/*.json` corpus
 * for several normas) didn't recognise InfoLEG's structural-section markers
 * — strings like "PRIMERA PARTE", "LIBRO PRIMERO", "TÍTULO PRELIMINAR",
 * "CAPÍTULO SEGUNDO", "SECCIÓN 1ª". As a result these headers got
 * concatenated to the END of the previous article's text, and the
 * `Article.location` object was left empty.
 *
 * `splitArticleHeaders` recovers both pieces of information at db-import
 * time: it returns the article body cleaned of trailing-header noise plus
 * the ordered list of detected headers, ready to be promoted to
 * `estructura_normativa` rows.
 *
 * The detection is conservative: only lines that match a structural
 * keyword (PARTE / LIBRO / TÍTULO / CAPÍTULO / SECCIÓN) followed by an
 * ordinal are recognised. The line immediately following such a keyword
 * (after optional blank lines) is captured as the section's subtitle when
 * present, mimicking InfoLEG's two-line header style:
 *
 *     CAPÍTULO SEGUNDO
 *     Nuevos derechos y garantías
 */

import type { StructuralLevel } from "../../laws/hierarchy.js";

export interface DetectedHeader {
  tipo: StructuralLevel;
  ordinal: string;
  /** Display name, e.g. "Capítulo Segundo — Nuevos derechos y garantías". */
  nombre: string;
}

export interface SplitResult {
  cleanText: string;
  trailingHeaders: DetectedHeader[];
}

/**
 * Levels recognised by this parser, ordered by canonical nesting depth
 * (outermost first). Used by callers to compute parent_id when promoting
 * detected headers to `estructura_normativa` rows.
 */
export const NESTED_LEVELS: readonly StructuralLevel[] = [
  "parte",
  "libro",
  "titulo",
  "capitulo",
  "seccion",
];

interface KeywordMatch {
  tipo: StructuralLevel;
  ordinal: string;
  display: string;
}

function capitalize(s: string): string {
  // Roman numerals must stay fully uppercase (e.g. "III" → "III", not "Iii").
  if (/^[IVXLCDM]+$/i.test(s)) return s.toUpperCase();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const SPANISH_ORDINAL_FEM =
  "PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[ÉE]PTIMA|OCTAVA|NOVENA|D[ÉE]CIMA";
const SPANISH_ORDINAL_MASC =
  "PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO|UND[ÉE]CIMO|DUOD[ÉE]CIMO";

function detectKeyword(line: string): KeywordMatch | null {
  let m = line.match(new RegExp(`^(${SPANISH_ORDINAL_FEM})\\s+PARTE\\s*$`, "iu"));
  if (m) return { tipo: "parte", ordinal: m[1]!, display: `${capitalize(m[1]!)} Parte` };

  m = line.match(
    new RegExp(`^LIBRO\\s+(${SPANISH_ORDINAL_MASC}|[IVXLC]+|\\d+)\\s*$`, "iu"),
  );
  if (m) return { tipo: "libro", ordinal: m[1]!, display: `Libro ${capitalize(m[1]!)}` };

  m = line.match(
    new RegExp(`^T[ÍI]TULO\\s+(PRELIMINAR|${SPANISH_ORDINAL_MASC}|[IVXLC]+|\\d+)\\s*$`, "iu"),
  );
  if (m) return { tipo: "titulo", ordinal: m[1]!, display: `Título ${capitalize(m[1]!)}` };

  m = line.match(
    new RegExp(`^CAP[ÍI]TULO\\s+(${SPANISH_ORDINAL_MASC}|[IVXLC]+|\\d+)\\s*$`, "iu"),
  );
  if (m) return { tipo: "capitulo", ordinal: m[1]!, display: `Capítulo ${capitalize(m[1]!)}` };

  m = line.match(
    new RegExp(`^SECCI[ÓO]N\\s+(${SPANISH_ORDINAL_FEM}|[IVXLC]+|\\d+(?:[ªº])?)\\s*$`, "iu"),
  );
  if (m) return { tipo: "seccion", ordinal: m[1]!, display: `Sección ${capitalize(m[1]!)}` };

  return null;
}

/**
 * `keywordPos` is the index of a structural-keyword line. Returns the index
 * of the subtitle line (immediately following, possibly past blank lines)
 * if present, otherwise -1. Stops if the next non-blank line is itself
 * another structural keyword.
 */
function findSubtitleIndex(lines: readonly string[], keywordPos: number): number {
  for (let j = keywordPos + 1; j < lines.length; j++) {
    const candidate = lines[j]!.trim();
    if (!candidate) continue;
    if (detectKeyword(candidate)) return -1;
    return j;
  }
  return -1;
}

/**
 * Walks the article text and splits out any structural headers.
 *
 * In the legacy-parsed corpus these headers always appear as a contiguous
 * block at the END of the text — the legacy parser slurped everything up
 * to the next article opener, so the entire structural transition between
 * sections ended up appended to the previous article. We exploit that:
 * the first structural keyword we encounter marks the start of the
 * trailing-header zone, and EVERYTHING from there onward is dropped from
 * the body. Within that zone we extract the keyword+subtitle pairs we
 * recognise; orphan all-caps lines that follow (e.g., the unkeyworded
 * "DEL PODER LEGISLATIVO" that's morally a Sección subtitle) are simply
 * discarded — they would otherwise contaminate the article text.
 */
export function splitArticleHeaders(text: string): SplitResult {
  const lines = text.split("\n");
  const headers: DetectedHeader[] = [];

  // Find the first structural keyword line. Everything from there onward
  // is the trailing-header zone.
  let zoneStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;
    if (detectKeyword(trimmed)) {
      zoneStart = i;
      break;
    }
  }

  if (zoneStart === -1) {
    // No structural-keyword line found — return text untouched.
    return { cleanText: text, trailingHeaders: [] };
  }

  // Extend the zone backward to absorb orphan ALL-CAPS lines that precede
  // the first detected keyword. These appear in InfoLEG's rendering as
  // section/title labels with the keyword implied — for example:
  //
  //     <last sentence of art 86 — body>
  //     DEL PODER EJECUTIVO    ← orphan: morally "Sección Segunda — Del Poder Ejecutivo"
  //     CAPÍTULO PRIMERO       ← first detected keyword (zoneStart)
  //     De su naturaleza y duración
  //
  // Without this back-extension the orphan ends up in the article body.
  while (zoneStart > 0) {
    const prev = lines[zoneStart - 1]!.trim();
    if (!prev) {
      zoneStart--;
      continue;
    }
    if (isOrphanCapsLine(prev)) {
      zoneStart--;
    } else {
      break;
    }
  }

  // Extract keyword+subtitle pairs from the trailing zone.
  for (let i = zoneStart; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;
    const k = detectKeyword(trimmed);
    if (!k) continue;
    const subtitleIdx = findSubtitleIndex(lines, i);
    let nombre = k.display;
    if (subtitleIdx >= 0) {
      const subtitle = lines[subtitleIdx]!.trim();
      nombre = `${k.display} — ${subtitle}`;
    }
    headers.push({ tipo: k.tipo, ordinal: k.ordinal, nombre });
  }

  // Body is everything before the trailing-header zone, with trailing/leading
  // blanks trimmed.
  const bodyLines = lines.slice(0, zoneStart);
  trimOrphanCapsTail(bodyLines);
  return { cleanText: bodyLines.join("\n"), trailingHeaders: headers };
}

/**
 * Standalone version that handles articles WITHOUT any structural keyword
 * but with trailing orphan all-caps lines (e.g., CPCCN articles whose
 * legacy parser left "SUBSISTENCIA DE LOS DOMICILIOS" hanging at the end
 * without a following CAPÍTULO/SECCIÓN keyword). Used by callers that have
 * authoritative structural data from elsewhere (`art.location`) but still
 * want the body cleaned of trailing-marker noise.
 *
 * Two passes:
 *   1. Strip end-of-string orphan caps that share a line with body text,
 *      following sentence-ending punctuation or a closing parenthesis.
 *   2. Strip trailing whole orphan-caps lines.
 */
export function trimTrailingOrphans(text: string): string {
  let t = text;
  // Pass 1: end-of-string orphan caps after sentence boundary or `)`.
  // Examples handled:
  //   "...los jueces. EL CIVILMENTE DEMANDADO" → "...los jueces."
  //   "...26/7/2018)TITULO II - JUICIO EJECUTIVO" → "...26/7/2018)"
  //   "...del proceso. PRUEBA" → "...del proceso."
  t = t.replace(
    /([.!?:)])(?:\s*)([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\d\s\-–—.]{2,79})\s*$/u,
    (match, punct: string, tail: string) => {
      // Only strip if `tail` is mostly letters (avoid trimming legitimate
      // numeric/citation suffixes like ")B.O. 26/7/2018").
      const letters = (tail.match(/[A-ZÁÉÍÓÚÑ]/gu) ?? []).length;
      const digits = (tail.match(/\d/g) ?? []).length;
      if (letters < 4 || digits > letters) return match;
      // Don't trim if tail looks like an acronym at end of sentence (3-4 caps).
      const trimmed = tail.trim();
      if (trimmed.length < 5) return match;
      return punct;
    },
  );
  // Pass 2: trailing whole orphan-caps lines.
  const lines = t.split("\n");
  trimOrphanCapsTail(lines);
  return lines.join("\n");
}

function trimOrphanCapsTail(lines: string[]): void {
  // Trim trailing blank lines first.
  while (lines.length > 0 && !lines[lines.length - 1]!.trim()) lines.pop();
  // Then peel off trailing orphan-all-caps lines and any blank lines that
  // surround them. Stop as soon as we hit a normal body line.
  while (lines.length > 0) {
    const last = lines[lines.length - 1]!.trim();
    if (!last) {
      lines.pop();
      continue;
    }
    if (isOrphanCapsLine(last)) {
      lines.pop();
      continue;
    }
    break;
  }
  // Trim leading blanks for safety.
  while (lines.length > 0 && !lines[0]!.trim()) lines.shift();
}

export function nestingDepth(level: StructuralLevel): number {
  const idx = NESTED_LEVELS.indexOf(level);
  return idx === -1 ? 999 : idx;
}

/**
 * Returns true for short, all-uppercase lines that look like a structural
 * label whose keyword (SECCIÓN / TÍTULO) was dropped in transit. Examples:
 *   "DEL PODER EJECUTIVO", "AUTORIDADES DE LA NACION".
 *
 * False for ordinary article-body lines (they carry lowercase letters or
 * are too long to be a label).
 */
function isOrphanCapsLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 4 || t.length > 80) return false;
  // Reject if there's any lowercase letter — that disqualifies normal prose.
  if (/[a-záéíóúñü]/u.test(t)) return false;
  // Require at least one letter (otherwise it's just punctuation/digits).
  if (!/[A-ZÁÉÍÓÚÑ]/u.test(t)) return false;
  // Reject if it's clearly a citation/closing date pattern (mostly digits
  // and slashes — e.g., "B.O. 22/11/2001"). These appear inside parentheses
  // typically; we keep them in the body.
  const letters = (t.match(/[A-ZÁÉÍÓÚÑ]/gu) ?? []).length;
  const digits = (t.match(/\d/g) ?? []).length;
  if (digits > letters) return false;
  return true;
}
