import type { Article } from "../../laws/types.js";
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
  const preface = text.slice(0, first.index);
  text = text.slice(first.index);
  text = truncateAtMarkers(text, FOOTERS);

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: Article[] = [];
  let ctx: StructureContext = {};
  let current: Article | null = null;

  for (const line of preface.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(-80)) {
    if (lineStartsStructuralHeading(line) && !/^art\.?\s+\d+/i.test(line)) {
      ctx = updateContextFromLine(ctx, line);
    }
  }

  const artRe = new RegExp(CPPF_ARTICLE_RE.source.replace('^\\s*','^'), 'iu');

  for (const line of lines) {
    if (/^ANEXO\s+I$/i.test(line)) continue;
    if (lineStartsStructuralHeading(line)) {
      ctx = updateContextFromLine(ctx, line);
      continue;
    }
    const m = artRe.exec(line);
    if (m) {
      if (current) out.push(current);
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
  if (current) out.push(current);
  return out;
}
