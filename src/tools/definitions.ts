import { z } from "zod";
import { LawIdSchema } from "../laws/types.js";

export const searchLawInputSchema = {
  query: z.string().min(1).max(500).describe("Palabras clave, tema o número de artículo."),
  law: LawIdSchema.optional().describe("Opcional: acotar a una ley específica."),
  article: z
    .string()
    .max(20)
    .optional()
    .describe("Opcional: filtrar por número exacto de artículo."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Cantidad máxima de resultados (default 20, máx 100)."),
} as const;

export const getArticleInputSchema = {
  law: LawIdSchema.describe("Ley a consultar."),
  article_number: z
    .string()
    .min(1)
    .max(20)
    .describe("Número de artículo (acepta variantes como '14bis', '8 bis')."),
} as const;

export const compareArticlesInputSchema = {
  law_a: LawIdSchema,
  article_a: z.string().min(1).max(20),
  law_b: LawIdSchema,
  article_b: z.string().min(1).max(20),
} as const;
