import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Article, Inciso } from "../../laws/types.js";
import { htmlToText, parseArticles, sliceFromFirstMatch, truncateAtMarkers, ARTICLE_RE } from "./base.js";

const FOOTERS = [
  /^\s*Antecedentes\s+Normativos\b/im,
  /^\s*LEGISLACI[OÓ]N\s+RELACIONADA\b/im,
  /^\s*Normas\s+modificatorias\b/im,
  /^\s*Notas?:\s*$/im,
  /^\s*NOTA:\s/im,
];
const LOG_DIR = path.resolve(process.cwd(), "parser_logs");

function extractNumericIncisos(text: string): { text: string; incisos: Inciso[]; reason: string } {
  const source = text.trim().replace(/\r/g, "");
  const rawMatches = [...source.matchAll(/(?:(?<=^)|(?<=\n)|(?<=:\s))(\d{1,2})(?:°|º|\)|\.)\s+/gim)];
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
    const start = cur.index! + cur[0].length;
    const end = next ? next.index! : source.length;
    const body = source.slice(start, end).trim().replace(/\s+/g, " ");
    if (!body) return { text, incisos: [], reason: "numeric_empty" };
    incisos.push({ id: cur[1]!, text: body });
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
    const start = cur.index! + cur[0].length;
    const end = next ? next.index! : source.length;
    const body = source.slice(start, end).trim().replace(/\s+/g, " ");
    if (!body) return { text, incisos: [], reason: "letter_empty" };
    incisos.push({ id: cur[1]!.toLowerCase(), text: body });
  }
  return { text: intro, incisos, reason: `letter_${incisos.length}` };
}

function writeAuditLog(lines: string[]): void {
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(path.join(LOG_DIR, "ley_19550-incisos.log"), `${lines.join("\n")}\n`);
}

export function parseLey19550(html: string): Article[] {
  let text = htmlToText(html);
  text = sliceFromFirstMatch(text, ARTICLE_RE);
  text = truncateAtMarkers(text, FOOTERS);
  const arts = parseArticles(text);
  const audit: string[] = [];
  for (const art of arts) {
    const numeric = extractNumericIncisos(art.text);
    if (numeric.incisos.length > 0) {
      art.text = numeric.text;
      art.incisos = numeric.incisos;
      audit.push(`[art ${art.number}, incisos ${art.incisos.length}, decision ${numeric.reason}]`);
      continue;
    }
    const lettered = extractLetteredIncisos(art.text);
    art.text = lettered.text;
    art.incisos = lettered.incisos;
    audit.push(`[art ${art.number}, incisos ${art.incisos.length}, decision ${lettered.incisos.length > 0 ? lettered.reason : numeric.reason !== 'no_numeric_enum' ? numeric.reason : lettered.reason}]`);
  }
  if (process.env.ARGLEG_WRITE_PARSER_LOGS === "1") writeAuditLog(audit);
  return arts;
}
