import type { Article, Inciso } from "../../laws/types.js";
import { htmlToText } from "./base.js";

const CN_ARTICLE_RE =
  /^\s*Art[íi]culo\s+(\d+(?:\s*bis)?)\s*[°º]?\.?-\s*/gimu;

function extractConstitutionIncisos(text: string): { text: string; incisos: Inciso[] } {
  const rawMatches = [...text.matchAll(/(?:(?<=^)|(?<=\n)|(?<=\s))(\d{1,2})\.\s+/g)].filter((m) => {
    const idx = m.index ?? 0;
    const prefix = text.slice(Math.max(0, idx - 24), idx + m[0].length);
    return !/Art[íi]culo\s+\d+\.\s*$/i.test(prefix.trimEnd());
  });
  if (rawMatches.length < 2) return { text: text.trim(), incisos: [] };

  const matches: RegExpMatchArray[] = [];
  let expected = 1;
  let started = false;
  for (const m of rawMatches) {
    const id = Number(m[1]);
    if (!started) {
      if (id !== 1) continue;
      started = true;
      matches.push(m);
      expected = 2;
      continue;
    }
    if (id === expected) {
      matches.push(m);
      expected += 1;
    }
  }

  if (matches.length < 2) return { text: text.trim(), incisos: [] };

  const firstIdx = matches[0]?.index ?? -1;
  if (firstIdx < 0) return { text: text.trim(), incisos: [] };

  const intro = text.slice(0, firstIdx).trim();
  const incisos: Inciso[] = [];

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const next = matches[i + 1];
    const id = cur[1]!;
    const start = cur.index! + cur[0].length;
    const end = next ? next.index! : text.length;
    const body = text.slice(start, end).trim();
    if (!body) continue;
    incisos.push({ id, text: body });
  }

  if (incisos.length < 2) return { text: text.trim(), incisos: [] };
  return { text: intro, incisos };
}

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
    const structured = extractConstitutionIncisos(body);
    out.push({
      number: cur.number,
      text: structured.text,
      incisos: structured.incisos,
      location: {},
      materia: [],
    });
  }
  return out;
}
