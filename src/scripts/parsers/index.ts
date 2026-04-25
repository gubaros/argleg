import type { Article, LawId } from "../../laws/types.js";
import { parseCcyc } from "./ccyc.js";
import { parseConstitucion } from "./constitucion.js";
import { parseCppf } from "./cppf.js";
import { parseCpccn } from "./cpccn.js";
import { parseLey24240 } from "./ley_24240.js";
import { parsePenal } from "./penal.js";
import { parseGeneric } from "./generic.js";
import { parseLey19549 } from "./ley_19549.js";
import { parseLey19550 } from "./ley_19550.js";

export function parseLawHtml(id: LawId, html: string): Article[] {
  switch (id) {
    case "constitucion":
      return parseConstitucion(html);
    case "ccyc":
      return parseCcyc(html);
    case "penal":
      return parsePenal(html);
    case "cppf":
      return parseCppf(html);
    case "cpccn":
      return parseCpccn(html);
    case "ley_24240":
      return parseLey24240(html);
    case "ley_19549":
      return parseLey19549(html);
    case "ley_19550":
      return parseLey19550(html);
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}
