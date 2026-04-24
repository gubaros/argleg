import type { Article } from "../../laws/types.js";
import { parseGeneric } from "./generic.js";

export function parseLey24240(html: string): Article[] {
  return parseGeneric(html);
}
