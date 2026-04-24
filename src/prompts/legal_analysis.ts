import { z } from "zod";
import type { LawId } from "../laws/types.js";

export const LEGAL_DISCLAIMER =
  "AVISO: Este análisis es informativo, basado únicamente en los textos normativos cargados en la base local. " +
  "No constituye asesoramiento legal profesional ni sustituye la consulta con un abogado/a matriculado/a.";

export const legalAnalysisArgsSchema = {
  question: z
    .string()
    .min(5)
    .describe("Pregunta o hipótesis jurídica a analizar (sólo con base en las normas locales)."),
  law: z
    .enum(["constitucion", "ccyc", "penal", "cppf", "ley_24240"])
    .optional()
    .describe("Opcional: acotar el análisis a una norma específica."),
  articles: z
    .string()
    .optional()
    .describe("Opcional: lista de artículos a considerar, p.ej. 'CN 14bis, CCyC 19'."),
} as const;

export interface LegalAnalysisArgs {
  question: string;
  law?: LawId;
  articles?: string;
}

export function renderLegalAnalysisPrompt(args: LegalAnalysisArgs): string {
  const scope = args.law ? `Acotar el análisis a: ${args.law}.` : "Considerar todas las normas disponibles en la base local.";
  const refs = args.articles ? `Artículos sugeridos: ${args.articles}.` : "";
  return [
    LEGAL_DISCLAIMER,
    "",
    "Eres un asistente jurídico con acceso EXCLUSIVO a los textos cargados en la base local mediante las herramientas y recursos del servidor MCP `argleg`.",
    "",
    "Reglas estrictas:",
    "1. No inventes texto legal. Si no encontrás una norma o artículo en la base local, responde literalmente: \"norma no disponible en la base local\".",
    "2. Citá siempre ley + artículo (+ inciso si corresponde) y la fuente declarada por el recurso.",
    "3. Si la pregunta excede lo disponible, indicá qué falta y sugerí al usuario consultar a un profesional.",
    "4. No des consejo personalizado vinculante; presentá el marco normativo y sus implicancias.",
    "",
    "Procedimiento sugerido:",
    "- Usar `search_law` para localizar normas relevantes.",
    "- Usar `get_article` para recuperar el texto preciso.",
    "- Usar `compare_articles` si hay tensión entre normas.",
    "- Leer los recursos `law://...` para obtener contexto estructural cuando sea necesario.",
    "",
    `Pregunta del usuario: ${args.question}`,
    scope,
    refs,
  ]
    .filter((l) => l !== "")
    .join("\n");
}
