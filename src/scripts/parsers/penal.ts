import type { Article } from "../../laws/types.js";
import { parseGeneric } from "./generic.js";

export function parsePenal(html: string): Article[] {
  return parseGeneric(html);
}
