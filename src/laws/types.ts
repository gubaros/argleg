import { z } from "zod";

export const LawIdSchema = z
  .enum(["constitucion", "ccyc", "penal", "cppf", "cpccn", "ley_24240"])
  .describe("Identificador canónico de la norma.");

export type LawId = z.infer<typeof LawIdSchema>;

export const IncisoSchema = z.object({
  id: z.string().describe("Letra o número del inciso, p.ej. 'a', '1', 'I'."),
  text: z.string(),
});

export const ArticleLocationSchema = z
  .object({
    libro: z.string().optional(),
    parte: z.string().optional(),
    titulo: z.string().optional(),
    capitulo: z.string().optional(),
    seccion: z.string().optional(),
  })
  .describe("Ubicación estructural del artículo dentro de la norma.");

export const ArticleSchema = z.object({
  number: z.string().describe("Número de artículo como string para soportar 14bis, 75 inc., etc."),
  title: z.string().optional(),
  text: z.string(),
  incisos: z.array(IncisoSchema).default([]),
  location: ArticleLocationSchema.default({}),
  materia: z.array(z.string()).default([]).describe("Etiquetas temáticas: 'derechos fundamentales', 'contratos', etc."),
  source: z.string().optional().describe("Fuente textual específica, p.ej. URL InfoLEG o BORA del artículo."),
  notes: z.string().optional(),
});

export const LawSchema = z.object({
  id: LawIdSchema,
  title: z.string(),
  shortName: z.string(),
  officialNumber: z.string().optional().describe("Número oficial, p.ej. 'Ley 24.240', 'Ley 26.994'."),
  source: z.string().describe("Fuente principal de la norma (URL o cita)."),
  lastUpdated: z.string().describe("Fecha ISO de última actualización en el archivo local."),
  description: z.string().optional(),
  articles: z.array(ArticleSchema),
});

export type Inciso = z.infer<typeof IncisoSchema>;
export type Article = z.infer<typeof ArticleSchema>;
export type ArticleLocation = z.infer<typeof ArticleLocationSchema>;
export type Law = z.infer<typeof LawSchema>;

export const LAW_IDS: LawId[] = [
  "constitucion",
  "ccyc",
  "penal",
  "cppf",
  "cpccn",
  "ley_24240",
];

export const LAW_FILE_BY_ID: Record<LawId, string> = {
  constitucion: "constitucion.json",
  ccyc: "ccyc.json",
  penal: "penal.json",
  cppf: "cppf.json",
  cpccn: "cpccn.json",
  ley_24240: "ley_24240.json",
};
