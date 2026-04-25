import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadLibrary, findArticle, NOT_AVAILABLE, type LoadedLibrary } from "./laws/loader.js";
import { searchArticles } from "./laws/search.js";
import { formatArticle, formatHit, formatLawSummary } from "./laws/format.js";
import { LawIdSchema, LAW_IDS, type LawId } from "./laws/types.js";
import { log, resultSize } from "./log.js";
import { ARGLEG_BUILD_DATE_TIME, ARGLEG_VERSION } from "./version.js";

const DISCLAIMER =
  "\n\n---\n> **Aviso legal:** Esta información es de carácter orientativo. El contenido normativo proviene de " +
  "archivos locales y no sustituye el asesoramiento profesional de un abogado matriculado. " +
  "Verificá siempre el texto vigente en fuentes oficiales (InfoLEG, BORA).";

const VERSION_TEXT = `\n\nVersión de ArgLeg MCP: ${ARGLEG_VERSION} (${ARGLEG_BUILD_DATE_TIME})`;

function textPayload(text: string, extra: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text" as const, text: text + VERSION_TEXT }],
    structuredContent: { version: ARGLEG_VERSION, ...extra },
  };
}

export async function buildServer(): Promise<McpServer> {
  const lib = await loadLibrary();

  log.info("server.loading", {
    data_dir: lib.dataDir,
    loaded: lib.laws.size,
    missing: lib.missing.length,
    errors: lib.errors.length,
  });

  for (const e of lib.errors) {
    log.error("server.load_error", { law: e.law, error: e.error });
  }
  if (lib.missing.length > 0) {
    log.info("server.missing_laws", { laws: lib.missing });
  }
  for (const [id, law] of lib.laws.entries()) {
    log.verbose("server.law_loaded", {
      id,
      articles: law.articles.length,
      short: law.shortName,
    });
  }

  const server = new McpServer(
    { name: "argleg-mcp", version: ARGLEG_VERSION },
    { capabilities: { resources: {}, tools: {}, prompts: {} } },
  );

  registerTools(server, lib);
  registerResources(server, lib);
  registerPrompts(server);

  log.info("server.ready", {
    tools: 4,
    resources: lib.laws.size + 1,
    prompts: 2,
    log_level: log.level,
  });

  return server;
}

// ─── Logged handler helpers ──────────────────────────────────────────────────

async function runToolLogged<T>(
  name: string,
  args: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  log.verbose("tool.call", {
    name,
    args: log.level === "debug" ? args : undefined,
  });
  try {
    const result = await fn();
    const ms = Date.now() - start;
    log.verbose("tool.done", {
      name,
      ms,
      size: log.level === "debug" ? resultSize(result) : undefined,
    });
    return result;
  } catch (err) {
    const ms = Date.now() - start;
    log.error("tool.error", {
      name,
      ms,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function runResourceLogged<T>(
  name: string,
  uri: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  log.verbose("resource.read", { name, uri });
  try {
    const result = await fn();
    const ms = Date.now() - start;
    log.verbose("resource.done", {
      name,
      uri,
      ms,
      size: log.level === "debug" ? resultSize(result) : undefined,
    });
    return result;
  } catch (err) {
    const ms = Date.now() - start;
    log.error("resource.error", {
      name,
      uri,
      ms,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

function runPromptLogged<T>(name: string, args: unknown, fn: () => T): T {
  log.verbose("prompt.call", {
    name,
    args: log.level === "debug" ? args : undefined,
  });
  try {
    return fn();
  } catch (err) {
    log.error("prompt.error", {
      name,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ─── Tools ───────────────────────────────────────────────────────────────────

function registerTools(server: McpServer, lib: LoadedLibrary): void {
  server.registerTool(
    "server_info",
    {
      title: "Información del servidor ArgLeg",
      description: "Devuelve metadata operativa del servidor, incluyendo versión y ubicación de la base local.",
      inputSchema: {},
    },
    async () =>
      runToolLogged("server_info", {}, async () =>
        textPayload(
          [
            `Servidor: argleg-mcp`,
            `Versión: ${ARGLEG_VERSION}`,
            `Fecha y hora de versión: ${ARGLEG_BUILD_DATE_TIME}`,
            `Base local: ${lib.dataDir}`,
            `Normas cargadas: ${lib.laws.size}`,
          ].join("\n"),
          {
            name: "argleg-mcp",
            version: ARGLEG_VERSION,
            buildDateTime: ARGLEG_BUILD_DATE_TIME,
            dataDir: lib.dataDir,
            loadedLaws: lib.laws.size,
          },
        ),
      ),
  );

  // search_law
  server.registerTool(
    "search_law",
    {
      title: "Buscar en legislación argentina",
      description:
        "Busca artículos en la legislación argentina por palabra clave, materia, capítulo o número de artículo. " +
        "Devuelve resultados únicamente desde los archivos locales. Si la norma no está cargada, indica 'norma no disponible en la base local'.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(500)
          .describe("Término de búsqueda: palabra clave, materia o número de artículo."),
        law: LawIdSchema.optional().describe(
          "Acotar búsqueda a una norma específica. Valores: constitucion | ccyc | penal | cppf | cpccn | ley_24240 | ley_19550 | ley_19549.",
        ),
        article: z
          .string()
          .max(20)
          .optional()
          .describe("Número de artículo exacto, p.ej. '14', '14bis', '1710'."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Máximo de resultados (default 10)."),
      },
    },
    async (args) =>
      runToolLogged("search_law", args, async () => {
        const { query, law, article, limit } = args;
        if (law && !lib.laws.has(law)) {
          log.info("search_law.missing_law", { law });
          return textPayload(NOT_AVAILABLE, { law });
        }

        const hits = searchArticles(lib, { query, law, article, limit });
        log.verbose("search_law.result", {
          query,
          law,
          article,
          hits: hits.length,
        });

        if (hits.length === 0) {
          return textPayload(
            "No se encontraron resultados para la consulta en la base local." + DISCLAIMER,
            { query, law, article, results: 0 },
          );
        }

        const body = hits.map(formatHit).join("\n\n");
        return textPayload(`## Resultados (${hits.length})\n\n${body}${DISCLAIMER}`, {
          query,
          law,
          article,
          results: hits.length,
        });
      }),
  );

  // get_article
  server.registerTool(
    "get_article",
    {
      title: "Obtener artículo por número",
      description:
        "Devuelve el texto completo de un artículo específico de una norma, con identificación precisa: " +
        "ley, artículo, inciso, capítulo y fuente. Sólo desde archivos locales.",
      inputSchema: {
        law: LawIdSchema.describe(
          "Norma a consultar. Valores: constitucion | ccyc | penal | cppf | cpccn | ley_24240 | ley_19550 | ley_19549.",
        ),
        article_number: z
          .string()
          .min(1)
          .max(20)
          .describe("Número de artículo, p.ej. '14', '14bis', '75'."),
      },
    },
    async (args) =>
      runToolLogged("get_article", args, async () => {
        const { law, article_number } = args;
        if (!lib.laws.has(law)) {
          log.info("get_article.missing_law", { law });
          return textPayload(NOT_AVAILABLE, { law });
        }

        const art = findArticle(lib, law, article_number);
        if (!art) {
          log.info("get_article.missing_article", { law, article_number });
          return textPayload(
            `norma no disponible en la base local (Art. ${article_number} de \`${law}\` no está cargado).`,
            { law, article_number },
          );
        }

        const lawObj = lib.laws.get(law)!;
        const text = formatArticle(law, lawObj, art);
        return textPayload(text + DISCLAIMER, { law, article_number, found: true });
      }),
  );

  // compare_articles
  server.registerTool(
    "compare_articles",
    {
      title: "Comparar artículos entre normas",
      description:
        "Presenta en paralelo dos artículos de distintas normas (o de la misma) para facilitar la comparación textual. " +
        "No realiza interpretación jurídica. Solo desde archivos locales.",
      inputSchema: {
        law_a: LawIdSchema.describe("Primera norma."),
        article_a: z.string().min(1).max(20).describe("Número de artículo de la primera norma."),
        law_b: LawIdSchema.describe("Segunda norma."),
        article_b: z.string().min(1).max(20).describe("Número de artículo de la segunda norma."),
      },
    },
    async (args) =>
      runToolLogged("compare_articles", args, async () => {
        const { law_a, article_a, law_b, article_b } = args;
        const missing: string[] = [];

        const lawObjA = lib.laws.get(law_a);
        const lawObjB = lib.laws.get(law_b);

        if (!lawObjA) missing.push(law_a);
        if (!lawObjB) missing.push(law_b);

        if (missing.length > 0) {
          log.info("compare_articles.missing_law", { missing });
          return textPayload(`${NOT_AVAILABLE}: ${missing.join(", ")}`, { missing });
        }

        const artA = findArticle(lib, law_a, article_a);
        const artB = findArticle(lib, law_b, article_b);

        const notFound: string[] = [];
        if (!artA) notFound.push(`Art. ${article_a} de \`${law_a}\``);
        if (!artB) notFound.push(`Art. ${article_b} de \`${law_b}\``);

        if (notFound.length > 0) {
          log.info("compare_articles.missing_article", { notFound });
          return textPayload(`norma no disponible en la base local: ${notFound.join(", ")}`, {
            notFound,
          });
        }

        const blockA = formatArticle(law_a, lawObjA!, artA!);
        const blockB = formatArticle(law_b, lawObjB!, artB!);

        const text = [
          "## Comparación de artículos",
          "",
          "### Artículo A",
          blockA,
          "",
          "---",
          "",
          "### Artículo B",
          blockB,
          DISCLAIMER,
        ].join("\n");

        return textPayload(text, { law_a, article_a, law_b, article_b });
      }),
  );
}

// ─── Resources ───────────────────────────────────────────────────────────────

function registerResources(server: McpServer, lib: LoadedLibrary): void {
  for (const id of LAW_IDS) {
    const law = lib.laws.get(id);
    const uri = `law://${id}`;

    if (!law) {
      server.registerResource(
        id,
        uri,
        {
          title: `Norma: ${id}`,
          description: NOT_AVAILABLE,
          mimeType: "text/plain",
        },
        async () =>
          runResourceLogged(id, uri, async () => ({
            contents: [{ uri, mimeType: "text/plain", text: NOT_AVAILABLE + VERSION_TEXT }],
          })),
      );
      continue;
    }

    server.registerResource(
      id,
      uri,
      {
        title: law.title,
        description: `${law.officialNumber ?? law.title}. Artículos cargados: ${law.articles.length}. Fuente: ${law.source}`,
        mimeType: "text/markdown",
      },
      async () =>
        runResourceLogged(id, uri, async () => ({
          contents: [
            {
              uri,
              mimeType: "text/markdown",
              text: formatLawSummary(law) + DISCLAIMER + VERSION_TEXT,
            },
          ],
        })),
    );
  }

  const template = new ResourceTemplate("law://{id}/article/{number}", {
    list: async () => {
      log.verbose("resource.list", { template: "law://{id}/article/{number}" });
      const resources = [];
      for (const [lawId, law] of lib.laws.entries()) {
        for (const art of law.articles) {
          resources.push({
            uri: `law://${lawId}/article/${encodeURIComponent(art.number)}`,
            name: `${law.shortName} Art. ${art.number}`,
            description: art.title,
            mimeType: "text/markdown",
          });
        }
      }
      return { resources };
    },
    complete: {
      id: () => LAW_IDS as unknown as string[],
    },
  });

  server.registerResource(
    "law-article",
    template,
    {
      title: "Artículo de norma",
      description:
        "Devuelve el texto completo de un artículo. URI: law://{id}/article/{number}. " +
        "IDs válidos: constitucion, ccyc, penal, cppf, cpccn, ley_24240, ley_19550, ley_19549.",
      mimeType: "text/markdown",
    },
    async (uri, { id, number }) =>
      runResourceLogged("law-article", uri.href, async () => {
        const lawId = id as string;
        const articleNum = decodeURIComponent(number as string);

        if (!isValidLawId(lawId)) {
          log.info("resource.invalid_law", { law: lawId });
          return {
            contents: [{ uri: uri.href, mimeType: "text/plain", text: NOT_AVAILABLE + VERSION_TEXT }],
          };
        }

        const law = lib.laws.get(lawId as LawId);
        if (!law) {
          log.info("resource.missing_law", { law: lawId });
          return {
            contents: [{ uri: uri.href, mimeType: "text/plain", text: NOT_AVAILABLE + VERSION_TEXT }],
          };
        }

        const art = findArticle(lib, lawId as LawId, articleNum);
        if (!art) {
          log.info("resource.missing_article", { law: lawId, article: articleNum });
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "text/plain",
                text: `norma no disponible en la base local (Art. ${articleNum} de \`${lawId}\` no está cargado).${VERSION_TEXT}`,
              },
            ],
          };
        }

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: formatArticle(lawId as LawId, law, art) + DISCLAIMER + VERSION_TEXT,
            },
          ],
        };
      }),
  );
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "analisis_juridico",
    {
      title: "Análisis jurídico de un artículo",
      description:
        "Genera un prompt estructurado para que un LLM analice un artículo normativo en contexto. " +
        "No sustituye asesoramiento legal profesional.",
      argsSchema: {
        law: z
          .string()
          .describe("ID de la norma (constitucion, ccyc, penal, cppf, cpccn, ley_24240, ley_19550, ley_19549)."),
        article_number: z.string().describe("Número de artículo a analizar."),
        context: z
          .string()
          .optional()
          .describe("Situación o pregunta concreta del usuario (opcional)."),
      },
    },
    (args) =>
      runPromptLogged("analisis_juridico", args, () => {
        const { law, article_number, context } = args;
        const contextBlock = context
          ? `\n\nContexto del usuario:\n${context}`
          : "";

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: [
                  `Analizá el artículo ${article_number} de la norma \`${law}\` utilizando el recurso MCP \`law://${law}/article/${article_number}\`.`,
                  `Versión de ArgLeg MCP: ${ARGLEG_VERSION}.`,
                  "",
                  "Estructura tu respuesta en las siguientes secciones:",
                  "1. **Texto del artículo** (transcribir literalmente desde el recurso).",
                  "2. **Elementos normativos** (sujetos, conducta regulada, consecuencias jurídicas).",
                  "3. **Alcance e interpretación** (doctrina o jurisprudencia relevante si está disponible en la base local).",
                  "4. **Relaciones con otras normas** (artículos vinculados, si los conocés por la base local).",
                  contextBlock,
                  "",
                  "---",
                  "> **Aviso:** Este análisis es orientativo y no constituye asesoramiento jurídico profesional. " +
                    "Para casos concretos, consultá a un abogado matriculado. " +
                    "Verificá el texto vigente en InfoLEG o el Boletín Oficial.",
                ]
                  .filter((l) => l !== undefined)
                  .join("\n"),
              },
            },
          ],
        };
      }),
  );

  server.registerPrompt(
    "comparacion_normativa",
    {
      title: "Comparación normativa entre artículos",
      description:
        "Genera un prompt para comparar dos artículos de distintas normas y detectar concordancias, " +
        "diferencias o conflictos normativos.",
      argsSchema: {
        law_a: z.string().describe("ID primera norma."),
        article_a: z.string().describe("Número artículo primera norma."),
        law_b: z.string().describe("ID segunda norma."),
        article_b: z.string().describe("Número artículo segunda norma."),
        focus: z
          .string()
          .optional()
          .describe("Aspecto específico a comparar (opcional)."),
      },
    },
    (args) =>
      runPromptLogged("comparacion_normativa", args, () => {
        const { law_a, article_a, law_b, article_b, focus } = args;
        const focusBlock = focus ? `\nAspecto a focalizar: ${focus}` : "";

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: [
                  `Comparará el Art. ${article_a} de \`${law_a}\` con el Art. ${article_b} de \`${law_b}\` usando la herramienta \`compare_articles\`.`,
                  `Versión de ArgLeg MCP: ${ARGLEG_VERSION}.`,
                  focusBlock,
                  "",
                  "Estructura tu análisis en:",
                  "1. **Texto de ambos artículos** (literales, desde la base local).",
                  "2. **Concordancias** (puntos en común).",
                  "3. **Diferencias** (conceptos, alcance, consecuencias).",
                  "4. **Conflictos o complementariedades** (si alguno deroga, complementa o prevalece sobre el otro).",
                  "",
                  "> **Aviso:** Análisis orientativo. No sustituye asesoramiento jurídico profesional.",
                ]
                  .filter(Boolean)
                  .join("\n"),
              },
            },
          ],
        };
      }),
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_LAW_IDS = new Set<string>(LAW_IDS);
function isValidLawId(id: string): boolean {
  return VALID_LAW_IDS.has(id);
}
