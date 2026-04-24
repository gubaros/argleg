import { load } from "cheerio";
import type { Article } from "../../laws/types.js";

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
