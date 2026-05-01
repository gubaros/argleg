import type { Article } from "../../laws/types.js";
import { htmlToText, truncateAtMarkers } from "./base.js";

const FOOTERS = [/^\s*Antecedentes\s+Normativos\b/im];
// In InfoLEG's rendering of Ley 25.326 articles begin in two slightly different
// shapes depending on the article number:
//   "ARTICULO 9° — (Título)."   (ordinal degree + em dash)
//   "ARTICULO 10. — (Título)."  (period + em dash)
// We allow any mix of whitespace and separators between the number and the
// start of the title (which is either a parenthetical or capitalised text).
const ARTICLE_RE =
  /^\s*ART[IÍ]CULO\s+(\d+\s*[°º]?\s*(?:bis|ter|quater|quinquies|sexies)?|\d+)[\s\-–—:.]+(?=\(|[A-ZÁÉÍÓÚ])/gimu;

export function parseLey25326(html: string): Article[] {
  let text = htmlToText(html);
  const first = /ART[IÍ]CULO\s+1\s*[°º]?[\s\-–—:.]+\(/iu.exec(text);
  if (!first) return [];
  text = text.slice(first.index);
  text = truncateAtMarkers(text, FOOTERS);

  const matches: Array<{ number: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(ARTICLE_RE.source, ARTICLE_RE.flags);
  while ((m = re.exec(text)) !== null) {
    const number = (m[1] ?? "").replace(/°|º/g, "").replace(/\s+/g, "").toLowerCase();
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
      .replace(/\n\s*TITULO\s+[A-ZÁÉÍÓÚ0-9]+.*$/imu, "")
      .replace(/\n\s*CAPITULO\s+[A-ZÁÉÍÓÚ0-9]+.*$/imu, "")
      .trim();
    if (!body || seen.has(cur.number)) continue;
    seen.add(cur.number);
    out.push({ number: cur.number, text: body, incisos: [], location: {}, materia: [] });
  }
  return out;
}
