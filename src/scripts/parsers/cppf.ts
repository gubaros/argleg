import type { Article } from "../../laws/types.js";
import { htmlToText, truncateAtMarkers } from "./base.js";

const START_PATTERNS = [
  /anexo\s+i\s+codigo\s+procesal\s+penal\s+de\s+la\s+nacion/iu,
  /anexo\s+i\s+codigo\s+procesal\s+penal\s+federal/iu,
  /anexo\s+i/iu,
];

const FOOTERS = [/^\s*ANEXO\s+II\b/im];

const CPPF_ARTICLE_RE =
  /^\s*(?:ART[IÍ]CULO|Art[íi]culo|Art\.?)\s+(\d+(?:°|º)?(?:\s*(?:bis|ter|quater|quinquies|sexies))?)\s*[\-–—:.]+\s*/gimu;

export function parseCppf(html: string): Article[] {
  let text = htmlToText(html);
  for (const re of START_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      text = text.slice(m.index);
      break;
    }
  }

  const first = /^\s*(?:ART[IÍ]CULO|Art[íi]culo|Art\.?)\s+1(?:°|º)?\s*[\-–—:.]/imu.exec(text);
  if (!first) return [];
  text = text.slice(first.index);
  text = truncateAtMarkers(text, FOOTERS);

  const matches: Array<{ number: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(CPPF_ARTICLE_RE.source, CPPF_ARTICLE_RE.flags);
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
    body = body.replace(/^<[^>]+>/, "").trim();
    if (!body || seen.has(cur.number)) continue;
    seen.add(cur.number);
    out.push({ number: cur.number, text: body, incisos: [], location: {}, materia: [] });
  }
  return out;
}
