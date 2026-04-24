import type { Article } from "../../laws/types.js";
import { htmlToText, truncateAtMarkers } from "./base.js";

const FOOTERS = [/^\s*Antecedentes\s+Normativos\b/im];
const PENAL_ARTICLE_RE =
  /^\s*Art[íi]culo\s+(\d+\s*[°º]?\s*(?:bis|ter|quater|quinquies|sexies)?|\d+)(?:\s*[\-–—:.]+\s*|\s+)/gimu;

export function parsePenal(html: string): Article[] {
  let text = htmlToText(html);
  const first = /Art[íi]culo\s+1\s*[°º]?\s*[\-–—:.]+\s*Este\s+C[oó]digo\s+se\s+aplicar[aá]/iu.exec(text);
  if (!first) return [];
  text = text.slice(first.index);
  text = truncateAtMarkers(text, FOOTERS);

  const matches: Array<{ number: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(PENAL_ARTICLE_RE.source, PENAL_ARTICLE_RE.flags);
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
      .replace(/\n\s*LIBRO\s+[A-ZÁÉÍÓÚ0-9]+.*$/imu, "")
      .replace(/\n\s*TITULO\s+[A-ZÁÉÍÓÚ0-9]+.*$/imu, "")
      .replace(/\n\s*CAPITULO\s+[A-ZÁÉÍÓÚ0-9]+.*$/imu, "")
      .trim();
    if (!body || seen.has(cur.number)) continue;
    seen.add(cur.number);
    out.push({ number: cur.number, text: body, incisos: [], location: {}, materia: [] });
  }
  return out;
}
