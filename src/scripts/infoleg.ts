import { load } from "cheerio";
import type { Article, Law, LawId } from "../laws/types.js";

/**
 * Extracts articles from an InfoLEG-like HTML document.
 *
 * Heuristic: InfoLEG pages concatenate articles inside <p>/<div> blocks using
 * headers like "ARTICULO 1°" or "Art. 14 bis". We flatten the block-level text
 * with newline separators, then split on article headers via regex.
 *
 * This is best-effort. The operator should review the output before trusting it.
 */
export function extractArticles(html: string): Article[] {
  const $ = load(html);

  // Prefer the known InfoLEG container, fall back to body.
  const container = $("#Contenido").length ? $("#Contenido") : $("body");

  // InfoLEG often encodes article flow with <br> tags inside a few large containers.
  // Flattening only block elements loses late sections (notably in CCyC), so we first
  // serialize the whole container HTML, turn <br> into line breaks, then read text.
  const rawHtml = container.html() ?? "";
  const withBreaks = rawHtml.replace(/<br\s*\/?>/gi, "\n");
  const text = load(`<div id="root">${withBreaks}</div>`)("#root")
    .text()
    .replace(/ /g, " ")
    .replace(/\r\n/g, "\n");

  return parseArticlesFromText(text);
}

const ARTICLE_RE =
  /^\s*(?:ART[IÍ]CULO|Art[íi]culo|Art\.?)\s+(\d+(?:°|º)?(?:\s*(?:bis|ter|quater|quinquies|sexies))?)\s*[.\-–—:]*\s*/gimu;

/**
 * Markers that signal the end of the normative body and the start of
 * metadata sections (modification history, footnotes, related legislation).
 * Article headers past these markers are usually cross-references, not real articles.
 */
const FOOTER_MARKERS = [
  /^\s*Antecedentes\s+Normativos\b/im,
  /^\s*LEGISLACI[OÓ]N\s+RELACIONADA\b/im,
  /^\s*Normas\s+modificatorias\b/im,
  /^\s*Notas?:\s*$/im,
  /^\s*NOTA:\s/im,
  /^\s*ANEXO\s+II\b/im,
];

function truncateAtFooter(text: string): string {
  let cut = text.length;
  for (const re of FOOTER_MARKERS) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  return text.slice(0, cut);
}

function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sliceAtAnnexIIfPresent(text: string): string {
  const directPatterns = [
    /anexo\s+i\s+titulo\s+preliminar/iu,
    /anexo\s+i\s+[\-–—]?\s*titulo\s+preliminar/iu,
    /anexo\s+i\s+cap[ií]tulo\s+1\s+derecho/iu,
  ];

  let best: number | null = null;
  for (const re of directPatterns) {
    const m = re.exec(text);
    if (m && (best === null || m.index < best)) best = m.index;
  }
  if (best !== null) return text.slice(best);

  const normalized = normalizeForSearch(text);
  const idx = normalized.indexOf("anexo i titulo preliminar");
  if (idx === -1) return text;

  // Fallback: rough projection from normalized index to original index.
  let out = 0;
  let acc = "";
  while (out < text.length && acc.length < idx) {
    acc += normalizeForSearch(text[out] ?? "");
    out += 1;
  }
  return text.slice(out);
}

export function parseArticlesFromText(raw: string): Article[] {
  const normalized = sliceAtAnnexIIfPresent(raw.replace(/\r\n/g, "\n"));

  // Skip any preamble (TOC, section headings) before the first article header.
  // Some InfoLEG pages put "Antecedentes Normativos" inside their TOC, which
  // would otherwise trigger truncateAtFooter prematurely.
  const firstRe = new RegExp(ARTICLE_RE.source, "imu");
  const firstMatch = firstRe.exec(normalized);
  if (!firstMatch) return [];

  const body = normalized.slice(firstMatch.index);
  const text = truncateAtFooter(body);
  const matches: Array<{ number: string; headerEnd: number; headerStart: number }> = [];

  const re = new RegExp(ARTICLE_RE.source, ARTICLE_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const rawNum = m[1] ?? "";
    const number = rawNum
      .replace(/°|º/g, "")
      .replace(/\s+/g, "")
      .toLowerCase();
    if (number.length === 0) continue;
    matches.push({
      number,
      headerStart: m.index,
      headerEnd: re.lastIndex,
    });
  }

  const articles: Article[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const nxt = matches[i + 1];
    const bodyStart = cur.headerEnd;
    const bodyEnd = nxt ? nxt.headerStart : text.length;
    const body = text.slice(bodyStart, bodyEnd).trim();
    if (body.length === 0) continue;
    if (seen.has(cur.number)) continue; // keep first occurrence, skip dupes
    seen.add(cur.number);
    articles.push({
      number: cur.number,
      text: body,
      incisos: [],
      location: {},
      materia: [],
    });
  }
  return articles;
}

export interface BuildLawOptions {
  id: LawId;
  title: string;
  shortName: string;
  officialNumber?: string;
  source: string;
  description?: string;
  lastUpdated?: string;
}

export function buildLaw(opts: BuildLawOptions, articles: Article[]): Law {
  return {
    id: opts.id,
    title: opts.title,
    shortName: opts.shortName,
    officialNumber: opts.officialNumber,
    source: opts.source,
    lastUpdated: opts.lastUpdated ?? new Date().toISOString().slice(0, 10),
    description: opts.description,
    articles,
  };
}
