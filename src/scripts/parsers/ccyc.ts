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
  /anexo\s+i\s+titulo\s+preliminar/iu,
  /anexo\s+i\s+[\-–—]?\s*titulo\s+preliminar/iu,
  /anexo\s+i\s+cap[ií]tulo\s+1\s+derecho/iu,
];

const FOOTERS = [/^\s*ANEXO\s+II\b/im];
const LOG_DIR = path.resolve(process.cwd(), "parser_logs");

function extractLetteredIncisos(text: string): { text: string; incisos: Inciso[]; reason: string } {
  const source = text.trim().replace(/\r/g, "");

  const lines = source.split("\n");
  const topLevelMarks: Array<{ line: number; id: string }> = [];
  let expected = "a";
  for (let i = 0; i < lines.length; i++) {
    const m = /^([a-z])\)\s+(.*)$/i.exec(lines[i] ?? "");
    if (!m) continue;
    const id = m[1]!.toLowerCase();
    if (id !== expected) continue;
    topLevelMarks.push({ line: i, id });
    expected = String.fromCharCode(expected.charCodeAt(0) + 1);
  }

  if (topLevelMarks.length >= 2) {
    const intro = lines.slice(0, topLevelMarks[0]!.line).join(" ").trim().replace(/\s+/g, " ");
    if (/[:.]$/.test(intro) || /(por los cuales|a petición de|previstos en esta|normas de este)$/i.test(intro)) {
      const incisos: Inciso[] = [];
      for (let i = 0; i < topLevelMarks.length; i++) {
        const cur = topLevelMarks[i]!;
        const next = topLevelMarks[i + 1];
        const chunk = lines.slice(cur.line, next ? next.line : lines.length).join(" ");
        const body = chunk.replace(/^[a-z]\)\s+/i, "").trim().replace(/\s+/g, " ");
        if (!body) return { text, incisos: [], reason: "empty_inciso" };
        incisos.push({ id: cur.id, text: body });
      }
      return { text: intro, incisos, reason: `lettered_lines_${incisos.length}` };
    }
  }

  const matches = [...source.matchAll(/(?:(?<=:\s)|(?<=;\s))([a-z])\)\s+/gim)];
  if (matches.length < 2) return { text, incisos: [], reason: "no_enum" };

  const letters = matches.map((m) => m[1]!.toLowerCase());
  if (letters[0] !== "a") return { text, incisos: [], reason: "enum_not_starting_a" };
  for (let i = 1; i < letters.length; i++) {
    if (letters[i]!.charCodeAt(0) !== letters[i - 1]!.charCodeAt(0) + 1) {
      return { text, incisos: [], reason: "enum_not_contiguous" };
    }
  }

  const first = matches[0]!;
  const firstIdx = first.index!;
  const intro = source.slice(0, firstIdx).trim().replace(/\s+/g, " ");
  if (!/[:.]$/.test(intro)) return { text, incisos: [], reason: "missing_intro_boundary" };

  const incisos: Inciso[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const next = matches[i + 1];
    const id = cur[1]!.toLowerCase();
    const start = cur.index! + cur[0].length;
    const end = next ? next.index! : source.length;
    const body = source.slice(start, end).trim().replace(/\s+/g, " ");
    if (!body) return { text, incisos: [], reason: "empty_inciso" };
    incisos.push({ id, text: body });
  }

  return { text: intro, incisos, reason: `lettered_inline_${incisos.length}` };
}

function auditLine(art: Article, reason: string): string {
  const bits: string[] = [];
  if (art.location.titulo) bits.push(`Título ${art.location.titulo}`);
  if (art.location.capitulo) bits.push(`Capítulo ${art.location.capitulo}`);
  if (art.location.seccion) bits.push(`Sección ${art.location.seccion}`);
  const prefix = bits.length > 0 ? `${bits.join(", ")}, ` : "";
  return `[${prefix}art ${art.number}, incisos ${art.incisos.length}, decision ${reason}]`;
}

function writeAuditLog(lines: string[]): void {
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(path.join(LOG_DIR, "ccyc-incisos.log"), `${lines.join("\n")}\n`);
}

export function parseCcyc(html: string): Article[] {
  let text = htmlToText(html);
  for (const re of START_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      text = text.slice(m.index);
      break;
    }
  }
  const first = /^\s*(?:ART[IÍ]CULO|Art[íi]culo|Art\.?)\s+1(?:°|º)?\s*[.\-–—:]/imu.exec(text);
  if (!first) return [];
  const preface = text.slice(0, first.index);
  text = text.slice(first.index);
  text = truncateAtMarkers(text, FOOTERS);

  const ctxLines = preface.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(-40);
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: Article[] = [];
  const audit: string[] = [];
  let ctx: StructureContext = {};
  let current: Article | null = null;

  for (const line of ctxLines) {
    if (lineStartsStructuralHeading(line)) ctx = updateContextFromLine(ctx, line);
  }

  const artRe = /^(?:ART[IÍ]CULO|Art[íi]culo|Art\.?)\s+(\d+(?:°|º)?(?:\s*(?:bis|ter|quater|quinquies|sexies))?)\s*[.\-–—:]+\s*(.*)$/iu;

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
        audit.push(auditLine(current, extracted.reason));
        out.push(current);
      }
      current = {
        number: (m[1] ?? "").replace(/°|º/g, "").replace(/\s+/g, "").toLowerCase(),
        text: (m[2] ?? "").trim(),
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
    audit.push(auditLine(current, extracted.reason));
    out.push(current);
  }
  if (process.env.ARGLEG_WRITE_PARSER_LOGS === "1") {
    writeAuditLog(audit);
  }
  return out;
}
