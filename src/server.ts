import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import path from "node:path";
import { z } from "zod";
import { openDb, resolveDbPath, type Db } from "./db/connection.js";
import { applySchema } from "./db/migrations.js";
import { SqliteLegalRepository } from "./laws/sqlite-repository.js";
import {
  articuloToArticle,
  normaToLaw,
  type ArticuloRow,
  type EstructuraNodo,
  type LegalRepository,
  type Norma,
  type SearchHitRow,
} from "./laws/repository.js";
import { formatArticle, formatHit, formatLawSummary } from "./laws/format.js";
import { LegalTierSchema, suggestNormaId } from "./laws/hierarchy.js";
import type { LawId, Law, Article } from "./laws/types.js";
import { log, resultSize } from "./log.js";
import { ARGLEG_BUILD_DATE_TIME, ARGLEG_VERSION } from "./version.js";
import type { SearchHit as LegacySearchHit } from "./laws/search.js";

const NOT_AVAILABLE = "norma no disponible en la base local";

const DISCLAIMER =
  "\n\n---\n> **Aviso legal:** Esta información es de carácter orientativo. El contenido normativo proviene de " +
  "una base SQLite local y no sustituye el asesoramiento profesional de un abogado matriculado. " +
  "Verificá siempre el texto vigente en fuentes oficiales (InfoLEG, BORA).";

const VERSION_TEXT = `\n\nVersión de ArgLeg MCP: ${ARGLEG_VERSION} (${ARGLEG_BUILD_DATE_TIME})`;

function textPayload(text: string, extra: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text" as const, text: text + VERSION_TEXT }],
    structuredContent: { version: ARGLEG_VERSION, ...extra },
  };
}

/**
 * Resuelve una sugerencia de id canónico para un input que no matchea. Combina
 * dos fuentes: (1) `suggestNormaId` puro sobre `TIER_BY_NORMA_ID`, y (2) el
 * `nombre_corto` de cada norma en la DB ("LNPA" → "ley_19549"). El primero
 * cubre dígitos y substrings del id; el segundo cubre el alias humano.
 */
function resolveSuggestion(rawId: string, repo: LegalRepository): string | null {
  return suggestNormaId(rawId) ?? repo.findNormaByShortName(rawId);
}

/**
 * Payload de "norma no disponible" enriquecido con sugerencia de id canónico
 * cuando hay un único candidato cercano. El mensaje devuelto al LLM cliente
 * incluye `¿Quisiste decir \`X\`?` y `structuredContent.suggestion = "X"` para
 * que el modelo pueda reintentar sin pedir otra vuelta al usuario.
 */
function notAvailablePayload(
  rawId: string,
  detail: string,
  extra: Record<string, unknown>,
  repo: LegalRepository,
) {
  const suggestion = resolveSuggestion(rawId, repo);
  const suffix = suggestion ? ` ¿Quisiste decir \`${suggestion}\`?` : "";
  return textPayload(`${NOT_AVAILABLE} (${detail}).${suffix}`, {
    ...extra,
    suggestion,
  });
}

export interface BuildServerOptions {
  /** Override the SQLite path (e.g., ":memory:" for tests). */
  dbPath?: string;
  /** Optional pre-built repository, used by tests to inject fixtures. */
  repository?: LegalRepository;
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<McpServer> {
  const { repo, dbPath, db } = openRepository(opts);

  const norms = repo.listNorms();
  log.info("server.loading", {
    db_path: dbPath,
    loaded: norms.length,
  });
  for (const n of norms) {
    log.verbose("server.norma_loaded", {
      id: n.id,
      short: n.nombre_corto,
    });
  }

  const server = new McpServer(
    { name: "argleg-mcp", version: ARGLEG_VERSION },
    { capabilities: { resources: {}, tools: {}, prompts: {} } },
  );

  registerTools(server, repo, dbPath);
  registerResources(server, repo);
  registerPrompts(server);

  // Hold a reference to db on the server object so tests can close it.
  // The MCP SDK's McpServer doesn't expose a "stop" hook we can hijack,
  // so callers that need cleanup can call the close function we attach.
  (server as unknown as { close: () => void }).close = () => {
    if (db) db.close();
  };

  log.info("server.ready", {
    tools: 10,
    resources: norms.length + 1,
    prompts: 2,
    log_level: log.level,
  });

  return server;
}

function openRepository(opts: BuildServerOptions): {
  repo: LegalRepository;
  dbPath: string;
  db: Db | null;
} {
  if (opts.repository) {
    return { repo: opts.repository, dbPath: "<injected>", db: null };
  }
  const dbPath = resolveDbPath({ path: opts.dbPath });
  const db = openDb({ path: dbPath });
  applySchema(db);
  const repo = new SqliteLegalRepository(db);
  return { repo, dbPath, db };
}

// ─── Logged handler helpers ──────────────────────────────────────────────────

async function runToolLogged<T>(
  name: string,
  args: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  log.verbose("tool.call", { name, args: log.level === "debug" ? args : undefined });
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
  log.verbose("prompt.call", { name, args: log.level === "debug" ? args : undefined });
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

function registerTools(server: McpServer, repo: LegalRepository, dbPath: string): void {
  // server_info
  server.registerTool(
    "server_info",
    {
      title: "Información del servidor ArgLeg",
      description:
        "Devuelve metadata operativa del servidor, incluyendo versión y ubicación de la base SQLite.",
      inputSchema: {},
    },
    async () =>
      runToolLogged("server_info", {}, async () => {
        const norms = repo.listNorms();
        return textPayload(
          [
            `Servidor: argleg-mcp`,
            `Versión: ${ARGLEG_VERSION}`,
            `Fecha y hora de versión: ${ARGLEG_BUILD_DATE_TIME}`,
            `Base SQLite: ${path.basename(dbPath)}`,
            `Normas cargadas: ${norms.length}`,
          ].join("\n"),
          {
            name: "argleg-mcp",
            version: ARGLEG_VERSION,
            buildDateTime: ARGLEG_BUILD_DATE_TIME,
            dbPath: path.basename(dbPath),
            loadedLaws: norms.length,
          },
        );
      }),
  );

  // list_norms
  server.registerTool(
    "list_norms",
    {
      title: "Listar normas disponibles",
      description:
        "Lista las normas cargadas en la base SQLite. Permite filtrar por tier de la pirámide normativa (constitucion_nacional, codigo_fondo, ley_federal, constitucion_provincial, etc.), materia o estado de vigencia.",
      inputSchema: {
        tier: LegalTierSchema.optional().describe(
          "Filtra por tier de la pirámide normativa argentina (ver src/laws/hierarchy.ts).",
        ),
        materia: z
          .string()
          .optional()
          .describe("Filtra por materia (substring sobre la lista de materias de la norma)."),
        estado_vigencia: z
          .string()
          .optional()
          .describe("Filtra por estado: vigente | derogada | desconocido."),
      },
    },
    async (args) =>
      runToolLogged("list_norms", args, async () => {
        const norms = repo.listNorms({
          tier: args.tier,
          materia: args.materia,
          estado_vigencia: args.estado_vigencia,
        });
        if (norms.length === 0) {
          return textPayload("No hay normas que coincidan con los filtros.", {
            count: 0,
            normas: [],
          });
        }
        const lines = norms.map(
          (n) =>
            `- \`${n.id}\` — ${n.titulo}${n.numero ? ` (${n.numero})` : ""}` +
            ` · estado: ${n.estado_vigencia}` +
            (n.nombre_corto ? ` · ${n.nombre_corto}` : ""),
        );
        const text = `## Normas disponibles (${norms.length})\n\n${lines.join("\n")}${DISCLAIMER}`;
        return textPayload(text, {
          count: norms.length,
          normas: norms.map((n) => ({
            id: n.id,
            titulo: n.titulo,
            numero: n.numero,
            nombre_corto: n.nombre_corto,
            estado_vigencia: n.estado_vigencia,
            tier: n.tier,
          })),
        });
      }),
  );

  // get_norm_metadata
  server.registerTool(
    "get_norm_metadata",
    {
      title: "Obtener metadata de una norma",
      description:
        "Devuelve la metadata completa de una norma (tipo, número, fechas, fuente, vigencia) y un resumen estructural.",
      inputSchema: {
        norma_id: z
          .string()
          .min(1)
          .describe("Identificador de la norma (p.ej. 'constitucion', 'ley_24240')."),
      },
    },
    async (args) =>
      runToolLogged("get_norm_metadata", args, async () => {
        const meta = repo.getNormMetadata(args.norma_id);
        if (!meta) {
          return notAvailablePayload(
            args.norma_id,
            `\`${args.norma_id}\` no está cargada`,
            { found: false, norma_id: args.norma_id },
            repo,
          );
        }
        const text = formatNormMetadata(meta);
        return textPayload(text + DISCLAIMER, {
          found: true,
          norma_id: meta.id,
          metadata: meta,
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
        "ley, artículo, capítulo y fuente. Lectura desde la base SQLite local.",
      inputSchema: {
        norma_id: z
          .string()
          .min(1)
          .describe("Identificador de la norma."),
        numero_articulo: z
          .string()
          .min(1)
          .max(20)
          .describe("Número de artículo, p.ej. '14', '14bis', '75'."),
      },
    },
    async (args) =>
      runToolLogged("get_article", args, async () => {
        const result = repo.getArticle(args.norma_id, args.numero_articulo);
        if (!result) {
          return notAvailablePayload(
            args.norma_id,
            `Art. ${args.numero_articulo} de \`${args.norma_id}\` no está cargado`,
            { norma_id: args.norma_id, numero_articulo: args.numero_articulo, found: false },
            repo,
          );
        }
        const law = lawFromNorma(result.norma);
        const article = articuloToArticle(result.articulo, result.contexto_estructural);
        const text = formatArticle(law.id, law, article);
        return textPayload(text + DISCLAIMER, {
          norma_id: result.norma.id,
          numero_articulo: result.articulo.numero,
          found: true,
        });
      }),
  );

  // search_articles
  server.registerTool(
    "search_articles",
    {
      title: "Buscar artículos en la legislación",
      description:
        "Busca artículos por palabra clave, materia o número en la base SQLite. Acepta filtro por norma.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(500)
          .describe("Término de búsqueda."),
        norma_id: z
          .string()
          .optional()
          .describe("Acota la búsqueda a una norma."),
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
      runToolLogged("search_articles", args, async () => {
        const hits = repo.searchArticles(args.query, {
          norma_id: args.norma_id,
          limit: args.limit,
        });
        if (hits.length === 0) {
          return textPayload(
            "No se encontraron resultados para la consulta en la base local." + DISCLAIMER,
            { query: args.query, norma_id: args.norma_id, results: 0 },
          );
        }
        const body = hits.map((h) => formatHit(toLegacyHit(h))).join("\n\n");
        return textPayload(`## Resultados (${hits.length})\n\n${body}${DISCLAIMER}`, {
          query: args.query,
          norma_id: args.norma_id,
          results: hits.length,
        });
      }),
  );

  // list_sections
  server.registerTool(
    "list_sections",
    {
      title: "Listar la jerarquía estructural de una norma",
      description:
        "Devuelve el árbol estructural completo de una norma (partes, libros, títulos, capítulos, secciones) con la cantidad de artículos directos en cada nodo. Útil para explorar cómo está organizada una norma sin leer artículo por artículo.",
      inputSchema: {
        norma_id: z
          .string()
          .min(1)
          .describe("Identificador de la norma (p.ej. 'constitucion', 'ccyc')."),
      },
    },
    async (args) =>
      runToolLogged("list_sections", args, async () => {
        const meta = repo.getNormMetadata(args.norma_id);
        if (!meta) {
          return notAvailablePayload(
            args.norma_id,
            `\`${args.norma_id}\` no está cargada`,
            { found: false, norma_id: args.norma_id },
            repo,
          );
        }
        const nodes = repo.getNormStructure(args.norma_id);
        if (nodes.length === 0) {
          return textPayload(
            `# ${meta.titulo}\n\n_La norma no tiene estructura jerárquica capturada (todos los artículos están al mismo nivel)._`,
            { found: true, norma_id: args.norma_id, sections: 0 },
          );
        }
        const text = formatStructureTree(meta.titulo, nodes);
        return textPayload(text + DISCLAIMER, {
          found: true,
          norma_id: args.norma_id,
          sections: nodes.length,
          tree: nodes.map((n) => ({
            id: n.id,
            tipo: n.tipo,
            nombre: n.nombre,
            parent_id: n.parent_id,
            orden: n.orden,
          })),
        });
      }),
  );

  // get_section
  server.registerTool(
    "get_section",
    {
      title: "Obtener una sección estructural y sus artículos",
      description:
        "Devuelve metadata de una sección estructural (parte, libro, título, capítulo o sección) más la lista completa de artículos contenidos. Resuelve el identificador exacto del nodo o una coincidencia parcial sobre el nombre. Permite leer 'todo el Capítulo X' en una sola llamada.",
      inputSchema: {
        norma_id: z
          .string()
          .min(1)
          .describe("Identificador de la norma."),
        identificador: z
          .string()
          .min(1)
          .describe(
            "ID exacto del nodo estructural o substring del nombre (p.ej. 'Capítulo Segundo', 'Nuevos derechos').",
          ),
      },
    },
    async (args) =>
      runToolLogged("get_section", args, async () => {
        const result = repo.getSection(args.norma_id, args.identificador);
        if (!result) {
          // Distinguir "la norma no existe" de "la sección no matchea":
          // si la norma no está cargada, sumamos la sugerencia de id canónico.
          if (!repo.getNormMetadata(args.norma_id)) {
            return notAvailablePayload(
              args.norma_id,
              `\`${args.norma_id}\` no está cargada`,
              { found: false, norma_id: args.norma_id, identificador: args.identificador },
              repo,
            );
          }
          return textPayload(
            `Sección no encontrada en \`${args.norma_id}\`: ${args.identificador}`,
            { found: false, norma_id: args.norma_id, identificador: args.identificador },
          );
        }
        const lines: string[] = [];
        const ancestros = result.ancestros.map((a) => a.nombre).join(" › ");
        if (ancestros) lines.push(`_${ancestros} ›_`);
        lines.push(`# ${result.nodo.nombre}`);
        lines.push(`**Tipo:** ${result.nodo.tipo}`);
        if (result.rango) {
          lines.push(
            `**Artículos:** ${result.articulos.length} (Art. ${result.rango.primero} a Art. ${result.rango.ultimo})`,
          );
        }
        if (result.articulos.length > 0) {
          lines.push("");
          lines.push("## Artículos contenidos");
          for (const a of result.articulos) {
            const head = a.epigrafe ? ` — ${a.epigrafe}` : "";
            lines.push(`\n### Art. ${a.numero}${head}`);
            lines.push(a.texto);
          }
        }
        return textPayload(lines.join("\n") + DISCLAIMER, {
          found: true,
          norma_id: args.norma_id,
          nodo: {
            id: result.nodo.id,
            tipo: result.nodo.tipo,
            nombre: result.nodo.nombre,
          },
          articulos_count: result.articulos.length,
          rango: result.rango,
        });
      }),
  );

  // list_ramas
  server.registerTool(
    "list_ramas",
    {
      title: "Listar ramas del derecho",
      description:
        "Devuelve las ramas del derecho que el MCP cubre con principios y doctrina, con su descripción y ámbito (público / privado / social / mixto).",
      inputSchema: {},
    },
    async () =>
      runToolLogged("list_ramas", {}, async () => {
        const ramas = repo.listRamas();
        const lines = ramas.map(
          (r) =>
            `- \`${r.id}\` — **${r.nombre}** (${r.ambito}${r.es_codificada ? ", codificada" : ""})`,
        );
        const text = `## Ramas del derecho disponibles (${ramas.length})\n\n${lines.join("\n")}${DISCLAIMER}`;
        return textPayload(text, {
          count: ramas.length,
          ramas: ramas.map((r) => ({
            id: r.id,
            nombre: r.nombre,
            ambito: r.ambito,
            es_codificada: r.es_codificada,
          })),
        });
      }),
  );

  // get_rama_metadata
  server.registerTool(
    "get_rama_metadata",
    {
      title: "Obtener metadata jurídica de una rama del derecho",
      description:
        "Devuelve principios fundamentales, normas que aplican (con su relevancia), doctrina representativa y jurisprudencia (cuando esté curada) de una rama del derecho.",
      inputSchema: {
        rama_id: z
          .string()
          .min(1)
          .describe("Identificador de la rama (p.ej. 'derecho_civil', 'derecho_penal')."),
      },
    },
    async (args) =>
      runToolLogged("get_rama_metadata", args, async () => {
        const r = repo.getRamaConContenido(args.rama_id);
        if (!r) {
          return textPayload(`Rama no encontrada: ${args.rama_id}`, {
            found: false,
            rama_id: args.rama_id,
          });
        }
        const text = formatRama(r);
        return textPayload(text + DISCLAIMER, {
          found: true,
          rama_id: r.rama.id,
          principios: r.principios.length,
          normas: r.normas.length,
          doctrina: r.doctrina.length,
          jurisprudencia: r.jurisprudencia.length,
        });
      }),
  );

  // compare_articles
  server.registerTool(
    "compare_articles",
    {
      title: "Comparar artículos entre normas",
      description:
        "Presenta en paralelo dos artículos de distintas normas (o de la misma) para facilitar la comparación textual. " +
        "No realiza interpretación jurídica.",
      inputSchema: {
        norma_a: z.string().min(1).describe("Primera norma."),
        articulo_a: z.string().min(1).max(20).describe("Número de artículo de la primera norma."),
        norma_b: z.string().min(1).describe("Segunda norma."),
        articulo_b: z.string().min(1).max(20).describe("Número de artículo de la segunda norma."),
      },
    },
    async (args) =>
      runToolLogged("compare_articles", args, async () => {
        const a = repo.getArticle(args.norma_a, args.articulo_a);
        const b = repo.getArticle(args.norma_b, args.articulo_b);
        const notFound: string[] = [];
        const suggestions: Record<string, string | null> = {};
        if (!a) {
          notFound.push(`Art. ${args.articulo_a} de \`${args.norma_a}\``);
          suggestions.norma_a = resolveSuggestion(args.norma_a, repo);
        }
        if (!b) {
          notFound.push(`Art. ${args.articulo_b} de \`${args.norma_b}\``);
          suggestions.norma_b = resolveSuggestion(args.norma_b, repo);
        }
        if (notFound.length > 0) {
          const hints: string[] = [];
          if (suggestions.norma_a) hints.push(`norma_a → \`${suggestions.norma_a}\``);
          if (suggestions.norma_b) hints.push(`norma_b → \`${suggestions.norma_b}\``);
          const suffix = hints.length > 0 ? ` ¿Quisiste decir ${hints.join(", ")}?` : "";
          return textPayload(`${NOT_AVAILABLE}: ${notFound.join(", ")}.${suffix}`, {
            notFound,
            suggestions,
          });
        }
        const lawA = lawFromNorma(a!.norma);
        const lawB = lawFromNorma(b!.norma);
        const blockA = formatArticle(
          lawA.id,
          lawA,
          articuloToArticle(a!.articulo, a!.contexto_estructural),
        );
        const blockB = formatArticle(
          lawB.id,
          lawB,
          articuloToArticle(b!.articulo, b!.contexto_estructural),
        );
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
        return textPayload(text, {
          norma_a: args.norma_a,
          articulo_a: args.articulo_a,
          norma_b: args.norma_b,
          articulo_b: args.articulo_b,
        });
      }),
  );
}

// ─── Resources ───────────────────────────────────────────────────────────────

function registerResources(server: McpServer, repo: LegalRepository): void {
  for (const n of repo.listNorms()) {
    const uri = `law://${n.id}`;
    server.registerResource(
      n.id,
      uri,
      {
        title: n.titulo,
        description:
          `${n.titulo}${n.numero ? ` (${n.numero})` : ""}. ` +
          `Estado: ${n.estado_vigencia}. ` +
          (n.fuente_url ? `Fuente: ${n.fuente_url}` : ""),
        mimeType: "text/markdown",
      },
      async () =>
        runResourceLogged(n.id, uri, async () => {
          const law = lawFromNormaWithArticles(repo, n);
          return {
            contents: [
              {
                uri,
                mimeType: "text/markdown",
                text: formatLawSummary(law) + DISCLAIMER + VERSION_TEXT,
              },
            ],
          };
        }),
    );
  }

  const template = new ResourceTemplate("law://{id}/article/{number}", {
    list: async () => {
      log.verbose("resource.list", { template: "law://{id}/article/{number}" });
      const resources = [];
      for (const n of repo.listNorms()) {
        for (const a of repo.listArticles(n.id)) {
          resources.push({
            uri: `law://${n.id}/article/${encodeURIComponent(a.numero)}`,
            name: `${n.nombre_corto ?? n.id} Art. ${a.numero}`,
            description: a.epigrafe ?? undefined,
            mimeType: "text/markdown",
          });
        }
      }
      return { resources };
    },
  });

  server.registerResource(
    "law-article",
    template,
    {
      title: "Artículo de norma",
      description:
        "Devuelve el texto completo de un artículo. URI: law://{norma_id}/article/{numero}.",
      mimeType: "text/markdown",
    },
    async (uri, { id, number }) =>
      runResourceLogged("law-article", uri.href, async () => {
        const normaId = id as string;
        const articleNum = decodeURIComponent(number as string);
        const result = repo.getArticle(normaId, articleNum);
        if (!result) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "text/plain",
                text: `${NOT_AVAILABLE} (Art. ${articleNum} de \`${normaId}\` no está cargado).${VERSION_TEXT}`,
              },
            ],
          };
        }
        const law = lawFromNorma(result.norma);
        const article = articuloToArticle(result.articulo, result.contexto_estructural);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: formatArticle(law.id, law, article) + DISCLAIMER + VERSION_TEXT,
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
        "Genera un prompt estructurado para que un LLM analice un artículo normativo en contexto.",
      argsSchema: {
        norma_id: z.string().describe("ID de la norma."),
        numero_articulo: z.string().describe("Número de artículo a analizar."),
        context: z.string().optional().describe("Situación o pregunta concreta del usuario."),
      },
    },
    (args) =>
      runPromptLogged("analisis_juridico", args, () => {
        const { norma_id, numero_articulo, context } = args;
        const contextBlock = context ? `\n\nContexto del usuario:\n${context}` : "";
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: [
                  `Analizá el artículo ${numero_articulo} de la norma \`${norma_id}\` utilizando el recurso MCP \`law://${norma_id}/article/${numero_articulo}\`.`,
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
                ].filter((l) => l !== undefined).join("\n"),
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
        norma_a: z.string().describe("ID primera norma."),
        articulo_a: z.string().describe("Número artículo primera norma."),
        norma_b: z.string().describe("ID segunda norma."),
        articulo_b: z.string().describe("Número artículo segunda norma."),
        focus: z.string().optional().describe("Aspecto específico a comparar."),
      },
    },
    (args) =>
      runPromptLogged("comparacion_normativa", args, () => {
        const { norma_a, articulo_a, norma_b, articulo_b, focus } = args;
        const focusBlock = focus ? `\nAspecto a focalizar: ${focus}` : "";
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: [
                  `Compará el Art. ${articulo_a} de \`${norma_a}\` con el Art. ${articulo_b} de \`${norma_b}\` usando la herramienta \`compare_articles\`.`,
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
                ].filter(Boolean).join("\n"),
              },
            },
          ],
        };
      }),
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lawFromNorma(n: Norma): Law {
  // Build a Law shape without articles — used when we only need the
  // metadata for formatArticle().
  return normaToLaw(n, [], new Map());
}

function lawFromNormaWithArticles(repo: LegalRepository, n: Norma): Law {
  const articulos = repo.listArticles(n.id);
  // Each article's structural context is fetched lazily; for the law summary
  // we only need basic article metadata, so an empty map keeps the cost low.
  return normaToLaw(n, articulos, new Map());
}

function toLegacyHit(hit: SearchHitRow): LegacySearchHit {
  const article: Article = articuloToArticle(hit.articulo, hit.contexto_estructural);
  return {
    law: hit.norma_id as LawId,
    lawTitle: hit.norma_titulo,
    article,
    score: hit.score,
    matchedOn: hit.matched_on.map((m): LegacySearchHit["matchedOn"][number] => {
      switch (m) {
        case "numero":
          return "number";
        case "epigrafe":
          return "title";
        case "texto":
          return "text";
        case "estructura":
          return "capitulo";
      }
    }),
  };
}

function formatStructureTree(
  titulo: string,
  nodes: Array<{ id: string; parent_id: string | null; tipo: string; nombre: string | null; orden: number }>,
): string {
  const byParent = new Map<string | null, typeof nodes>();
  for (const n of nodes) {
    const list = byParent.get(n.parent_id) ?? [];
    list.push(n);
    byParent.set(n.parent_id, list);
  }
  const lines: string[] = [`# ${titulo} — estructura`];
  function walk(parentId: string | null, depth: number): void {
    const children = byParent.get(parentId) ?? [];
    children.sort((a, b) => a.orden - b.orden);
    for (const c of children) {
      const indent = "  ".repeat(depth);
      lines.push(`${indent}- **${c.tipo}** · ${c.nombre ?? "(sin nombre)"} _(id: \`${c.id}\`)_`);
      walk(c.id, depth + 1);
    }
  }
  walk(null, 0);
  return lines.join("\n");
}

function formatRama(
  r: NonNullable<ReturnType<LegalRepository["getRamaConContenido"]>>,
): string {
  const lines: string[] = [];
  lines.push(`# ${r.rama.nombre}`);
  lines.push(`**Ámbito:** ${r.rama.ambito}${r.rama.es_codificada ? " · codificada" : ""}`);
  if (r.rama.descripcion) {
    lines.push("");
    lines.push(r.rama.descripcion);
  }

  if (r.principios.length > 0) {
    lines.push("");
    lines.push(`## Principios (${r.principios.length})`);
    for (const p of r.principios) {
      lines.push(`\n### ${p.nombre}`);
      lines.push(p.enunciado);
      if (p.fuente) lines.push(`*Fuente:* ${p.fuente}`);
      lines.push(`*Vigencia:* ${p.vigencia}`);
    }
  }

  if (r.normas.length > 0) {
    lines.push("");
    lines.push(`## Normas que aplican (${r.normas.length})`);
    for (const { norma, relevancia } of r.normas) {
      lines.push(
        `- \`${norma.id}\` — ${norma.titulo}${norma.numero ? ` (${norma.numero})` : ""} · _${relevancia}_`,
      );
    }
  }

  if (r.doctrina.length > 0) {
    lines.push("");
    lines.push(`## Doctrina (${r.doctrina.length})`);
    for (const d of r.doctrina) {
      lines.push(
        `- ${d.autor} — *${d.obra}*${d.ano_publicacion ? ` (${d.ano_publicacion})` : ""}${d.notas ? ` — ${d.notas}` : ""}`,
      );
    }
  }

  if (r.jurisprudencia.length > 0) {
    lines.push("");
    lines.push(`## Jurisprudencia (${r.jurisprudencia.length})`);
    for (const j of r.jurisprudencia) {
      lines.push(
        `- "${j.caratula}" — ${j.tribunal}${j.fecha ? ` (${j.fecha})` : ""}`,
      );
    }
  } else {
    lines.push("");
    lines.push(`> Jurisprudencia aún no curada para esta rama.`);
  }

  return lines.join("\n");
}

function formatNormMetadata(n: Norma & { resumen_estructural: ReturnType<LegalRepository["getNormMetadata"]> extends infer R ? R extends { resumen_estructural: infer S } ? S : never : never }): string {
  const lines: string[] = [];
  lines.push(`# ${n.titulo}`);
  if (n.numero) lines.push(`**Número:** ${n.numero}`);
  lines.push(`**Tier:** ${n.tier}`);
  if (n.nombre_corto) lines.push(`**Nombre corto:** ${n.nombre_corto}`);
  lines.push(`**Jurisdicción:** ${n.jurisdiccion} (${n.pais})`);
  if (n.autoridad_emisora) lines.push(`**Autoridad emisora:** ${n.autoridad_emisora}`);
  if (n.fecha_sancion) lines.push(`**Fecha de sanción:** ${n.fecha_sancion}`);
  if (n.fecha_promulgacion) lines.push(`**Fecha de promulgación:** ${n.fecha_promulgacion}`);
  if (n.fecha_publicacion) lines.push(`**Fecha de publicación:** ${n.fecha_publicacion}`);
  lines.push(`**Estado de vigencia:** ${n.estado_vigencia}`);
  if (n.fuente_url) lines.push(`**Fuente:** ${n.fuente_url}`);
  if (n.fecha_ultima_actualizacion) {
    lines.push(`**Última actualización local:** ${n.fecha_ultima_actualizacion}`);
  }
  if (n.materias && n.materias.length > 0) {
    lines.push(`**Materias:** ${n.materias.join(", ")}`);
  }
  if (n.notas) lines.push(`\n${n.notas}`);
  lines.push("");
  lines.push(`## Resumen estructural`);
  const r = n.resumen_estructural;
  lines.push(`- Niveles presentes: ${r.niveles.join(" → ") || "(plana)"}`);
  lines.push(`- Cantidad de artículos: ${r.cantidad_articulos}`);
  if (r.cantidad_titulos > 0) lines.push(`- Cantidad de títulos: ${r.cantidad_titulos}`);
  if (r.cantidad_capitulos > 0) lines.push(`- Cantidad de capítulos: ${r.cantidad_capitulos}`);
  if (r.cantidad_secciones > 0) lines.push(`- Cantidad de secciones: ${r.cantidad_secciones}`);
  lines.push(`- Profundidad máxima: ${r.profundidad_maxima}`);
  return lines.join("\n");
}
