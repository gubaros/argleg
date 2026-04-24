import type { Article } from "../../laws/types.js";
import { htmlToText } from "./base.js";

const CN_ARTICLE_RE =
  /^\s*Art[íi]culo\s+(\d+(?:\s*bis)?)\s*[°º]?\.?-\s*/gimu;

export function parseConstitucion(html: string): Article[] {
  let text = htmlToText(html);
  const first = /Art[íi]culo\s+1\s*[°º]?\.?-\s+La\s+Naci[oó]n\s+Argentina/iu.exec(text);
  if (!first) return [];
  text = text.slice(first.index);

  const matches: Array<{ number: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(CN_ARTICLE_RE.source, CN_ARTICLE_RE.flags);
  while ((m = re.exec(text)) !== null) {
    const number = (m[1] ?? "").replace(/\s+/g, "").toLowerCase();
    if (!number) continue;
    matches.push({ number, start: m.index, end: re.lastIndex });
  }

  const out: Article[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const next = matches[i + 1];
    let body = text.slice(cur.end, next ? next.start : text.length).trim();
    body = body
      .replace(/\n\s*CAPITULO\s+[A-ZÁÉÍÓÚ0-9]+.*$/imu, "")
      .replace(/\n\s*Secci[oó]n\s+.*$/imu, "")
      .trim();
    if (!body || seen.has(cur.number)) continue;
    seen.add(cur.number);
    out.push({ number: cur.number, text: body, incisos: [], location: {}, materia: [] });
  }
  return out;
}
