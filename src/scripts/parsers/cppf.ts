import type { Article } from "../../laws/types.js";
import { htmlToText, parseArticles, sliceFromFirstMatch, truncateAtMarkers } from "./base.js";

const START_PATTERNS = [
  /anexo\s+i\s+codigo\s+procesal\s+penal\s+de\s+la\s+nacion/iu,
  /anexo\s+i\s+codigo\s+procesal\s+penal\s+federal/iu,
  /anexo\s+i/iu,
];

const FOOTERS = [/^\s*ANEXO\s+II\b/im];

export function parseCppf(html: string): Article[] {
  let text = htmlToText(html);
  for (const re of START_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      text = text.slice(m.index);
      break;
    }
  }
  text = sliceFromFirstMatch(text, /^\s*(?:ART[IÍ]CULO|Art[íi]culo|Art\.?)\s+1(?:°|º)?\s*[\-–—:.]/imu);
  text = truncateAtMarkers(text, FOOTERS);
  return parseArticles(text);
}
