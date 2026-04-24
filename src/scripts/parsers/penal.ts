import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Article, Inciso } from "../../laws/types.js";
import { htmlToText, truncateAtMarkers } from "./base.js";

const FOOTERS = [/^\s*Antecedentes\s+Normativos\b/im];
const PENAL_ARTICLE_RE =
  /^\s*Art[íi]culo\s+(\d+\s*[°º]?\s*(?:bis|ter|quater|quinquies|sexies)?|\d+)(?:\s*[\-–—:.]+\s*|\s+)/gimu;
const LOG_DIR = path.resolve(process.cwd(), "parser_logs");

function extractNumericIncisos(text: string): { text: string; incisos: Inciso[]; reason: string } {
  const source = text.trim().replace(/\r/g, "");
  const rawMatches = [...source.matchAll(/(?:(?<=^)|(?<=\n)|(?<=:\s)|(?<=;\s)|(?<=\.\s))(\d{1,2})(?:°|º|\)|\.)\s+/gim)];
  if (rawMatches.length < 2) return { text, incisos: [], reason: "no_numeric_enum" };

  const matches: RegExpMatchArray[] = [];
  let expected = 1;
  for (const m of rawMatches) {
    const id = Number(m[1]);
    if (matches.length === 0) {
      if (id !== 1) continue;
      matches.push(m);
      expected = 2;
      continue;
    }
    if (id === expected) {
      matches.push(m);
      expected += 1;
    }
  }
  if (matches.length < 2) return { text, incisos: [], reason: "numeric_not_contiguous" };

  const intro = source.slice(0, matches[0]!.index!).trim().replace(/\s+/g, " ");
  if (!intro.endsWith(":")) return { text, incisos: [], reason: "numeric_missing_colon" };

  const incisos: Inciso[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const next = matches[i + 1];
    const id = cur[1]!;
    const start = cur.index! + cur[0].length;
    const end = next ? next.index! : source.length;
    const body = source.slice(start, end).trim().replace(/\s+/g, " ");
    if (!body) return { text, incisos: [], reason: "numeric_empty" };
    incisos.push({ id, text: body });
  }

  return { text: intro, incisos, reason: `numeric_${incisos.length}` };
}

function extractLetteredIncisos(text: string): { text: string; incisos: Inciso[]; reason: string } {
  const source = text.trim().replace(/\r/g, "");
  const matches = [...source.matchAll(/(?:(?<=^)|(?<=\n)|(?<=:\s))([a-z])\)\s+/gim)];
  if (matches.length < 2) return { text, incisos: [], reason: "no_letter_enum" };

  const letters = matches.map((m) => m[1]!.toLowerCase());
  if (letters[0] !== "a") return { text, incisos: [], reason: "letter_not_starting_a" };
  for (let i = 1; i < letters.length; i++) {
    if (letters[i]!.charCodeAt(0) !== letters[i - 1]!.charCodeAt(0) + 1) {
      return { text, incisos: [], reason: "letter_not_contiguous" };
    }
  }

  const intro = source.slice(0, matches[0]!.index!).trim().replace(/\s+/g, " ");
  if (!intro.endsWith(":")) return { text, incisos: [], reason: "letter_missing_colon" };

  const incisos: Inciso[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const next = matches[i + 1];
    const id = cur[1]!.toLowerCase();
    const start = cur.index! + cur[0].length;
    const end = next ? next.index! : source.length;
    const body = source.slice(start, end).trim().replace(/\s+/g, " ");
    if (!body) return { text, incisos: [], reason: "letter_empty" };
    incisos.push({ id, text: body });
  }

  return { text: intro, incisos, reason: `letter_${incisos.length}` };
}

function structurePenalArticle(art: Article): string {
  const numeric = extractNumericIncisos(art.text);
  if (numeric.incisos.length > 0) {
    art.text = numeric.text;
    art.incisos = numeric.incisos;
    return numeric.reason;
  }

  const lettered = extractLetteredIncisos(art.text);
  if (lettered.incisos.length > 0) {
    art.text = lettered.text;
    art.incisos = lettered.incisos;
    return lettered.reason;
  }

  return numeric.reason !== "no_numeric_enum" ? numeric.reason : lettered.reason;
}

function writeAuditLog(lines: string[]): void {
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(path.join(LOG_DIR, "penal-incisos.log"), `${lines.join("\n")}\n`);
}

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
  const audit: string[] = [];
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
    const art: Article = { number: cur.number, text: body, incisos: [], location: {}, materia: [] };
    const reason = structurePenalArticle(art);
    audit.push(`[art ${art.number}, incisos ${art.incisos.length}, decision ${reason}]`);
    out.push(art);
  }

  if (process.env.ARGLEG_WRITE_PARSER_LOGS === "1") writeAuditLog(audit);
  return out;
}
