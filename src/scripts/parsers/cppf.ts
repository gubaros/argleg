import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Article, Inciso } from "../../laws/types.js";
import {
  cloneContext,
  htmlToText,
  lineStartsStructuralHeading,
  truncateAtMarkers,
  updateContextFromLine,
  type StructureContext,
} from "./base.js";

const START_PATTERNS = [
  /anexo\s+i\s+codigo\s+procesal\s+penal\s+de\s+la\s+nacion/iu,
  /anexo\s+i\s+codigo\s+procesal\s+penal\s+federal/iu,
  /anexo\s+i/iu,
];

const FOOTERS = [/^\s*ANEXO\s+II\b/im];
const LOG_DIR = path.resolve(process.cwd(), "parser_logs");

const CPPF_ARTICLE_RE =
  /^\s*(?:ART[IÍ]CULO|Art[íi]culo|Art\.?)\s+(\d+(?:°|º)?(?:\s*(?:bis|ter|quater|quinquies|sexies))?)\s*[\-–—:.]+\s*/gimu;

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
  writeFileSync(path.join(LOG_DIR, "cppf-incisos.log"), `${lines.join("\n")}\n`);
}

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
  const preface = text.slice(0, first.index);
  text = text.slice(first.index);
  text = truncateAtMarkers(text, FOOTERS);

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: Article[] = [];
  const audit: string[] = [];
  let ctx: StructureContext = {};
  let current: Article | null = null;

  for (const line of preface.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(-80)) {
    if (lineStartsStructuralHeading(line) && !/^art\.?\s+\d+/i.test(line)) {
      ctx = updateContextFromLine(ctx, line);
    }
  }

  const artRe = new RegExp(CPPF_ARTICLE_RE.source.replace("^\\s*", "^"), "iu");

  for (const line of lines) {
    if (/^ANEXO\s+I$/i.test(line)) continue;
    if (lineStartsStructuralHeading(line)) {
      ctx = updateContextFromLine(ctx, line);
      continue;
    }
    const m = artRe.exec(line);
    if (m) {
      if (current) {
        const extracted = extractLetteredIncisos(current.text);
        current.text = extracted.text;
        current.incisos = extracted.incisos;
        audit.push(`[art ${current.number}, incisos ${current.incisos.length}, decision ${extracted.reason}]`);
        out.push(current);
      }
      current = {
        number: (m[1] ?? "").replace(/°|º/g, "").replace(/\s+/g, "").toLowerCase(),
        text: line.slice(m[0].length).trim(),
        incisos: [],
        location: cloneContext(ctx),
        materia: [],
      };
      continue;
    }
    if (current) current.text += `\n${line}`;
  }
  if (current) {
    const extracted = extractLetteredIncisos(current.text);
    current.text = extracted.text;
    current.incisos = extracted.incisos;
    audit.push(`[art ${current.number}, incisos ${current.incisos.length}, decision ${extracted.reason}]`);
    out.push(current);
  }
  if (process.env.ARGLEG_WRITE_PARSER_LOGS === "1") writeAuditLog(audit);
  return out;
}
