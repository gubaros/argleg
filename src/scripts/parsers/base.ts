import { load } from "cheerio";
import type { Article, ArticleLocation } from "../../laws/types.js";

export const ARTICLE_RE =
  /^\s*(?:ART[IÍ]CULO|Art[íi]culo|Art\.?)\s+(\d+(?:°|º)?(?:\s*(?:bis|ter|quater|quinquies|sexies))?)(?=\s*(?:[.\-–—:]|$))\s*[.\-–—:]*\s*/gimu;

export function htmlToText(html: string): string {
  const $ = load(html);
  const container = $("#Contenido").length ? $("#Contenido") : $("body");
  const rawHtml = container.html() ?? "";
  const withBreaks = rawHtml.replace(/<br\s*\/?>/gi, "\n");
  return load(`<div id="root">${withBreaks}</div>`)("#root")
    .text()
    .replace(/ /g, " ")
    .replace(/\r\n/g, "\n");
}

export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function sliceFromFirstMatch(text: string, re: RegExp): string {
  const first = new RegExp(re.source, "imu").exec(text);
  if (!first) return "";
  return text.slice(first.index);
}

export function truncateAtMarkers(text: string, markers: RegExp[]): string {
  let cut = text.length;
  for (const re of markers) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  return text.slice(0, cut);
}

export interface StructureContext extends ArticleLocation {}

export function cloneContext(ctx: StructureContext): ArticleLocation {
  return {
    libro: ctx.libro,
    parte: ctx.parte,
    titulo: ctx.titulo,
    capitulo: ctx.capitulo,
    seccion: ctx.seccion,
  };
}

export function parseArticles(text: string): Article[] {
  const matches: Array<{ number: string; headerEnd: number; headerStart: number }> = [];
  const re = new RegExp(ARTICLE_RE.source, ARTICLE_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const rawNum = m[1] ?? "";
    const number = rawNum.replace(/°|º/g, "").replace(/\s+/g, "").toLowerCase();
    if (!number) continue;
    matches.push({ number, headerStart: m.index, headerEnd: re.lastIndex });
  }

  const out: Article[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const next = matches[i + 1];
    const body = text.slice(cur.headerEnd, next ? next.headerStart : text.length).trim();
    if (!body || seen.has(cur.number)) continue;
    seen.add(cur.number);
    out.push({ number: cur.number, text: body, incisos: [], location: {}, materia: [] });
  }
  return out;
}

export function lineStartsStructuralHeading(line: string): boolean {
  const s = line.trim().replace(/\s+/g, " ");
  return /^(LIBRO|PARTE|T[ÍI]TULO|CAP[ÍI]TULO|SECCI[ÓO]N|[A-ZÁÉÍÓÚ]+\s+PARTE)\b/i.test(s);
}

function isMostlyUppercase(s: string): boolean {
  const letters = (s.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) ?? []).join("");
  if (!letters) return false;
  const upper = (letters.match(/[A-ZÁÉÍÓÚÑ]/g) ?? []).length;
  return upper / letters.length >= 0.7;
}

function cleanStructureValue(value?: string): string | undefined {
  if (!value) return undefined;
  const v = value.trim().replace(/\s+/g, " ");
  if (!v) return undefined;
  if (v.length > 40) return undefined;
  if (/[.;,]/.test(v)) return undefined;
  return v;
}

/**
 * Strip InfoLEG-style trailing epigraphs from article bodies.
 *
 * In InfoLEG HTML the descriptive title (epigraph) of article N+1 appears
 * before the "Art. N+1" marker, so the text parser appends it to the body of
 * article N. This pass detects it by the trailing-paragraph heuristic — short,
 * sentence-case, ends with a period — strips it from art[i].text, and assigns
 * it to art[i+1].title.
 *
 * NOT called from generic `parseArticles` to avoid false positives in normas
 * where short terminal sentences are legitimate content ("Derogado." in Penal,
 * Art. 2 of the Constitución, etc.). Callers must opt in explicitly.
 */
export function extractTrailingEpigraphs(arts: Article[]): void {
  for (let i = 0; i < arts.length - 1; i++) {
    const art = arts[i]!;
    const next = arts[i + 1]!;

    const lines = art.text.split("\n");

    // Find the last non-blank line.
    let lastNB = lines.length - 1;
    while (lastNB >= 0 && !lines[lastNB]!.trim()) lastNB--;
    if (lastNB < 0) continue;

    const lastLine = lines[lastNB]!.trim();

    // Epigraph criteria (tuned for InfoLEG LGS/LNPA style):
    //   - 4–80 chars: covers the longest known InfoLEG epigraph (76 chars)
    //     while excluding prose sentences that look similar in other normas.
    //   - Ends with '.': avoids "Serán sus atribuciones:" (colon-ending lead-ins).
    //   - Has at least one lowercase letter: sentence-case noun phrase, not ALL-CAPS.
    //   - Starts with an uppercase letter: not a parenthetical note.
    //   - Does not start with '(': rules out modification notes.
    if (
      lastLine.length >= 4 &&
      lastLine.length <= 80 &&
      lastLine.endsWith(".") &&
      !lastLine.startsWith("(") &&
      /[a-záéíóúñü]/u.test(lastLine) &&
      /^[A-ZÁÉÍÓÚÑ]/u.test(lastLine)
    ) {
      // Require at least one body line to remain — don't hollow out the article.
      const remaining = lines.slice(0, lastNB);
      while (remaining.length > 0 && !remaining[remaining.length - 1]!.trim()) remaining.pop();
      if (remaining.length === 0) continue;

      art.text = remaining.join("\n");
      if (!next.title) {
        next.title = lastLine.slice(0, -1); // strip trailing period
      }
    }
  }
}

export function updateContextFromLine(ctx: StructureContext, rawLine: string): StructureContext {
  const line = rawLine.trim().replace(/\s+/g, " ");
  const next: StructureContext = { ...ctx };

  let m = /^(PARTE\s+(GENERAL|ESPECIAL)|[A-ZÁÉÍÓÚ]+\s+PARTE\s*[-–—:]?\s*.+)$/i.exec(line);
  if (m) {
    const value = cleanStructureValue(m[1]);
    if (value && (value.toUpperCase() === value || /^PARTE\s+(GENERAL|ESPECIAL)$/i.test(value) || isMostlyUppercase(value))) {
      next.parte = value;
    }
    return next;
  }
  m = /^LIBRO\s+([^\-–—:]+)(?:\s*[-–—:]\s*(.+))?$/i.exec(line);
  if (m) {
    const value = cleanStructureValue(m[1]);
    if (!value) return next;
    next.libro = value;
    next.titulo = undefined;
    next.capitulo = undefined;
    next.seccion = undefined;
    return next;
  }
  m = /^T[ÍI]TULO\s+([^\-–—:]+)(?:\s*[-–—:]\s*(.+))?$/i.exec(line);
  if (m) {
    const value = cleanStructureValue(m[1]);
    if (!value) return next;
    next.titulo = value;
    next.capitulo = undefined;
    next.seccion = undefined;
    return next;
  }
  m = /^CAP[ÍI]TULO\s+([^\-–—:]+)(?:\s*[-–—:]\s*(.+))?$/i.exec(line);
  if (m) {
    const value = cleanStructureValue(m[1]);
    if (!value) return next;
    next.capitulo = value;
    next.seccion = undefined;
    return next;
  }
  m = /^SECCI[ÓO]N\s+([^\-–—:]+)(?:\s*[-–—:.]?\s*(.+))?$/i.exec(line);
  if (m) {
    const value = cleanStructureValue(m[1]);
    if (!value) return next;
    next.seccion = value;
    return next;
  }
  return next;
}
