import type { Article } from "../../laws/types.js";
import { htmlToText, truncateAtMarkers } from "./base.js";

const FOOTERS = [/^\s*Antecedentes\s+Normativos\b/im];

const CPCCN_ARTICLE_RE =
  /^\s*Art\.?\s+(\d+(?:°|º)?(?:\s*(?:bis|ter|quater|quinquies|sexies))?)\s*[\-–—:.]+\s*/gimu;

export function parseCpccn(html: string): Article[] {
  let text = htmlToText(html);
  const first = /^\s*Art\.?\s+1(?:°|º)?\s*[\-–—:.]/imu.exec(text);
  if (!first) return [];
  text = text.slice(first.index);
  text = truncateAtMarkers(text, FOOTERS);

  const matches: Array<{ number: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(CPCCN_ARTICLE_RE.source, CPCCN_ARTICLE_RE.flags);
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

    // Strip trailing all-caps headings accidentally glued to the end of the article.
    body = body
      .replace(/\n\s*[A-ZÁÉÍÓÚÑ0-9 .\-]{6,}\s*$/u, "")
      .replace(/\n\s*CAPITULO\s+[IVXLC0-9]+.*$/iu, "")
      .replace(/\n\s*TITULO\s+[IVXLC0-9]+.*$/iu, "")
      .trim();

    if (!body || seen.has(cur.number)) continue;
    seen.add(cur.number);
    out.push({ number: cur.number, text: body, incisos: [], location: {}, materia: [] });
  }
  return out;
}
