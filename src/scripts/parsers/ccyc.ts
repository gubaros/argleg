import type { Article } from "../../laws/types.js";
import { htmlToText, parseArticles, sliceFromFirstMatch, truncateAtMarkers } from "./base.js";

const START_PATTERNS = [
  /anexo\s+i\s+titulo\s+preliminar/iu,
  /anexo\s+i\s+[\-–—]?\s*titulo\s+preliminar/iu,
  /anexo\s+i\s+cap[ií]tulo\s+1\s+derecho/iu,
];

const FOOTERS = [/^\s*ANEXO\s+II\b/im];

export function parseCcyc(html: string): Article[] {
  let text = htmlToText(html);
  for (const re of START_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      text = text.slice(m.index);
      break;
    }
  }
  text = sliceFromFirstMatch(text, /^\s*(?:ART[IÍ]CULO|Art[íi]culo|Art\.?)\s+1(?=\s*(?:[.\-–—:]|$))/imu);
  text = truncateAtMarkers(text, FOOTERS);
  return parseArticles(text);
}
