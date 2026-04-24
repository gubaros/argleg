import type { Article } from "../../laws/types.js";
import { htmlToText, parseArticles, sliceFromFirstMatch, truncateAtMarkers, ARTICLE_RE } from "./base.js";

const FOOTERS = [
  /^\s*Antecedentes\s+Normativos\b/im,
  /^\s*LEGISLACI[OÓ]N\s+RELACIONADA\b/im,
  /^\s*Normas\s+modificatorias\b/im,
  /^\s*Notas?:\s*$/im,
  /^\s*NOTA:\s/im,
  /^\s*ANEXO\s+II\b/im,
];

export function parseGeneric(html: string): Article[] {
  let text = htmlToText(html);
  text = sliceFromFirstMatch(text, ARTICLE_RE);
  text = truncateAtMarkers(text, FOOTERS);
  return parseArticles(text);
}
