# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**argleg-mcp** is a read-only MCP (Model Context Protocol) server that exposes Argentine legislation to MCP clients (Claude Desktop, Claude Code, Cursor, etc.). The runtime source of truth is a local **SQLite database** at `data/argleg.db`. JSON files under `data/` are kept as ingest fixtures and as the format produced by the InfoLEG importers, but the MCP server itself reads only from SQLite.

## Commands

```bash
npm run dev              # run without compiling (uses tsx)
npm run build            # compile TypeScript → dist/
npm start                # run compiled server
npm test                 # run all tests (vitest)
npm run test:watch       # watch mode
npm run typecheck        # tsc --noEmit, no output files

npm run db:init          # create data/argleg.db with the schema (idempotent)
npm run db:import        # ingest every JSON in data/ into SQLite
npm run db:reset         # same as db:import but DELETEs everything first

npm run fetch -- --id <lawId> --url <URL> [--dry-run] [--force]   # import a law from InfoLEG to JSON
```

Run a single test file:
```bash
npx vitest run tests/repository.test.ts
```

The `prebuild` hook auto-bumps `src/version.ts` via `scripts/bump-version.mjs` on every `npm run build`.

## Architecture

### Data flow

```
InfoLEG HTML  →  npm run fetch (parser)  →  data/*.json
                                                  ↓
                                       npm run db:import
                                                  ↓
                                      data/argleg.db (SQLite)
                                                  ↓
                                  SqliteLegalRepository (src/laws/sqlite-repository.ts)
                                                  ↓
                                         src/server.ts (buildServer)
                                                  ↓
                                            MCP transport (stdio)
```

The arrows are unidirectional: the MCP server **never** reads JSON, and the importers **never** read SQLite. JSON is an export/input format; SQLite is the operational source of truth.

### SQLite schema (`src/db/schema.sql`)

Eleven tables, all in Spanish to align with the legal-domain vocabulary. Two layers:

**Corpus layer:**

- `normas` — one row per law (id, **tier** (LegalTier), numero, titulo, jurisdicción, fechas, estado_vigencia, fuente, materias…). The `tier` column is the new source of truth for what kind of norma each row is.
- `articulos` — one row per article (id, norma_id, numero, texto, orden, epígrafe). FK to `normas`.
- `estructura_normativa` — hierarchy nodes (libro, parte, título, capítulo, sección). Self-referential (`parent_id`).
- `articulo_estructura` — many-to-many link between articles and their structural ancestors.
- `relaciones_normativas` — modifica / es_modificada_por / deroga / etc. **Currently unpopulated**.

**Intelligence layer:**

- `ramas_derecho`, `principios_juridicos`, `norma_rama`, `doctrina`, `jurisprudencia`, `jurisprudencia_norma`. See "Intelligence layer" below.

Foreign keys are enforced (`PRAGMA foreign_keys = ON`); WAL journaling is enabled for on-disk databases.

### Key modules

- **`src/db/connection.ts`** — `openDb()` resolves the database path (option → `ARGLEG_DB` → `~/Desktop/mcp/data/argleg.db`) and applies the standard pragmas.
- **`src/db/migrations.ts`** — `applySchema(db)` reads `schema.sql` and runs it. Idempotent.
- **`src/laws/repository.ts`** — `LegalRepository` interface. Domain types (`Norma`, `ArticuloRow`, `EstructuraNodo`, `SearchHitRow`, `ResumenEstructural`) plus adapters (`articuloToArticle`, `normaToLaw`) that rebuild the legacy `Law`/`Article` shapes for `format.ts`.
- **`src/laws/sqlite-repository.ts`** — `SqliteLegalRepository` implements the interface. Search uses an OR'd LIKE filter in SQL to pull candidates, then a JS reranker (mirroring the legacy `foldText` scoring weights) to order them.
- **`src/laws/loader.ts`** — still loads JSON; **only used by the ingest scripts**, not by the runtime server. Exports `normalizeNumber()` which both ingest and repo use to compare article numbers (`"14bis"` ↔ `"14 bis"`, etc.).
- **`src/laws/format.ts`** — Markdown rendering for tools and resources. The repository feeds it adapters so the rendered output is byte-identical to the pre-refactor JSON-backed version.
- **`src/scripts/db-init.ts`** — `npm run db:init`. Creates the file if missing, applies schema.
- **`src/scripts/db-import.ts`** — `npm run db:import`. Reads JSONs via `loadLibrary()`, validates them (warnings vs fatal errors), inserts everything in a single transaction. Exports `importIntoDb(db, laws, opts)` for tests.
- **`src/server.ts`** — `buildServer({ dbPath?, repository? })`. Opens the DB (or accepts an injected repo for tests), registers six tools, the per-norma resources, the article template, and two prompts. Each handler goes through `runToolLogged` / `runResourceLogged` / `runPromptLogged`.
- **`src/index.ts`** — stdio entrypoint. Installs `transport.onmessage = logRpcMessage` **before** `server.connect()` so every inbound JSON-RPC message is logged at the protocol layer (see Logging below).
- **`src/log.ts`** — writes only to stderr. Levels: `silent` | `info` | `verbose` | `debug`. Optional JSON output and file mirroring.

### Legal hierarchy as data (`src/laws/hierarchy.ts`)

The Argentine legal pyramid is encoded as a typed model: 15 `LegalTier` values from `constitucion_nacional` (top) to `ordenanza_municipal` (bottom), each with a profile (kelsen rank, ámbito, emisor, base constitucional, allowed structural levels, header detection regexes). `TIER_BY_NORMA_ID` maps every corpus norma to its tier, including the 23 provincial constitutions and CABA. The `PROVINCIAS` catalogue lists the 24 jurisdictions with metadata for the ingest workflow (see [docs/provincial-constitutions.md](docs/provincial-constitutions.md)). A norma cannot be ingested unless its id is declared in `TIER_BY_NORMA_ID` first.

### Universal parser (`src/laws/universal-parser.ts`)

Single tier-aware parser that replaces per-law parsers. `parseDocument(html, tier)` returns `{ articles, structure, warnings }` regardless of input tier. Header detection is driven by `TIER_PROFILES[tier].niveles_posibles`; the parser walks the document linearly, maintains a stack of open structural nodes, normalises soft-wrap newlines mid-sentence, and emits coherence warnings if a level outside the tier's allowed set shows up. Mode (a)+(b): operator declares the tier; parser verifies via `verifyTierAgainstText` and warns on mismatch.

### Intelligence layer (`src/db/seeds/intelligence.ts`)

Five tables extend the corpus with curated legal knowledge:

- `ramas_derecho` — branches of law (constitucional, civil, comercial, penal, procesal, administrativo, consumidor, protección de datos) with descripción + ámbito.
- `principios_juridicos` — fundamental principles per branch, with enunciado, fuente normativa or doctrinaria, and vigencia (`positivado`/`dogmatico`/`controvertido`).
- `norma_rama` — many-to-many link between norms and branches, with `relevancia` (nuclear/complementaria/tangencial).
- `doctrina` — canonical authors and works.
- `jurisprudencia` (+ `jurisprudencia_norma`) — schema is ready but content curation is pending.

The seed is loaded inside the same transaction as the corpus by `db-import`. To extend: edit `src/db/seeds/intelligence.ts` and re-run `npm run db:reset`.

### MCP surface

| Kind | Name | Input |
|---|---|---|
| tool | `server_info` | — |
| tool | `list_norms` | `{ tier?, materia?, estado_vigencia? }` |
| tool | `get_norm_metadata` | `{ norma_id }` |
| tool | `get_article` | `{ norma_id, numero_articulo }` |
| tool | `search_articles` | `{ query, norma_id?, limit? }` |
| tool | `compare_articles` | `{ norma_a, articulo_a, norma_b, articulo_b }` |
| tool | `list_ramas` | — |
| tool | `get_rama_metadata` | `{ rama_id }` |
| resource | `law://<norma_id>` | per-norma summary |
| resource template | `law://{id}/article/{number}` | individual article |
| prompt | `analisis_juridico` | `{ norma_id, numero_articulo, context? }` |
| prompt | `comparacion_normativa` | `{ norma_a, articulo_a, norma_b, articulo_b, focus? }` |

### Corpus importers (`src/scripts/`)

`fetch-infoleg.ts` is a CLI that downloads a law from InfoLEG (or reads a local HTML file), runs it through the appropriate parser, and writes a validated JSON to `data/`. The dispatcher is `src/scripts/parsers/index.ts` — each law has its own parser (`ccyc.ts`, `constitucion.ts`, `ley_25326.ts`, etc.) built on top of shared utilities in `src/scripts/parsers/base.ts` (`htmlToText`, `parseArticles`, `updateContextFromLine`, `ARTICLE_RE`).

Adding a new law requires:
1. A new parser in `src/scripts/parsers/`.
2. Registering it in `parsers/index.ts`.
3. Adding the `LawId` to `LawIdSchema`, `LAW_IDS`, and `LAW_FILE_BY_ID` in `src/laws/types.ts`.
4. Adding defaults to `fetch-infoleg.ts`.
5. Running `npm run fetch -- --id <id> --url <URL> --force` to produce the JSON.
6. Running `npm run db:import` (or `db:reset`) to push it into SQLite.

`fetch-infoleg.ts` ships with a manual CP1252 decoder because Node's `TextDecoder("windows-1252")` leaves bytes 0x80–0x9F as raw control codepoints instead of mapping them to the typographic characters InfoLEG actually serves (`—`, `–`, `'`, `"`, `…`). Don't replace that decoder with `TextDecoder` unless Node fixes the upstream behaviour.

### Key constraints

- **stdout is sacred**: the MCP stdio transport uses stdout exclusively. All logging goes to stderr.
- **No runtime network access**: the server only reads `data/argleg.db`. The fetch/import scripts are build-time utilities.
- Database path resolution: `BuildServerOptions.dbPath` → `ARGLEG_DB` env var → `~/Desktop/mcp/data/argleg.db`.
- Article numbers are strings (supports `14bis`, `75 inc. 22`, etc.) and are normalised for comparison via `normalizeNumber`.
- The schema does not model incisos as a separate table. During ingest they are concatenated into `articulos.texto` using the same Markdown formatting as the runtime renderer (`formatInciso` in `src/laws/format.ts`), so the rendered output is identical to the pre-refactor JSON-backed version.

## Logging

The server emits logs at three levels of granularity:

1. **Protocol layer** (`src/index.ts`): `logRpcMessage` is hooked onto `transport.onmessage` before `server.connect()`. Every inbound JSON-RPC message produces an `rpc.request` (verbose) or `rpc.notification` (debug) log entry — including handshake messages like `initialize`, `notifications/initialized`, `tools/list`, etc., that the SDK handles internally without invoking a tool handler.
2. **Handler layer** (`src/server.ts`): every tool/resource/prompt invocation is wrapped in `runToolLogged` / `runResourceLogged` / `runPromptLogged`. These emit `tool.call` / `tool.done` / `tool.error` (and analogues) with timing. At `debug` level they also include args and result size.
3. **Lifecycle**: `server.loading`, `server.norma_loaded`, `server.ready`, `server.started`, `server.fatal`.

Levels:
- `silent` — nothing.
- `info` (default) — lifecycle only.
- `verbose` — adds `rpc.request`, `tool.call`, `tool.done`, `resource.read`, `resource.done`, `prompt.call`.
- `debug` — adds `rpc.notification`, plus args/params/result-size payloads on the handler-layer events.

Output goes to **stderr** by default. Set `ARGLEG_LOG_FILE=/path/to/file.log` to mirror everything to a file (useful when the MCP server is launched by Claude Desktop, which discards the child process's stderr — `tail -f` the file in another terminal to see live traffic).

## Environment variables

| Variable | Purpose |
|---|---|
| `ARGLEG_DB` | Path to the SQLite database (default: `~/Desktop/mcp/data/argleg.db`) |
| `ARGLEG_DATA_DIR` | Directory containing JSON fixtures, used by the ingest scripts |
| `ARGLEG_LOG_LEVEL` | `silent` \| `info` (default) \| `verbose` \| `debug` |
| `ARGLEG_LOG_JSON` | `1` for JSONL log output |
| `ARGLEG_LOG_FILE` | Path to duplicate log output to a file |
| `ARGLEG_VALIDATE_VERBOSE` | `1` to print every per-article validation warning during `db:import` |

## Best practices for every commit

Before opening or merging a PR, **review and update**:

1. **Logging.** If a behaviour changed at the protocol, handler, or lifecycle layer, the corresponding log event should reflect it. New env vars or runtime decisions are often worth a `log.info` at startup. Verify by running `ARGLEG_LOG_LEVEL=verbose npm start` (or piping JSON-RPC messages into `node dist/index.js`) and reading the output.
2. **Documentation.** Walk through the `.md` files at the repo root (`README.md`, `CLAUDE.md`, `BACKLOG.md`) and under `docs/` (`guia.md`, `guide.md`, `connect.md`). If anything in the change touches commands, scripts, env vars, the MCP surface (tools/resources/prompts), data flow, or the file layout, update **every** doc that mentions that area. The Spanish guide and the English guide must stay in sync.
3. **Tests.** Run `npm test` and `npm run typecheck`. New code paths warrant new tests — at minimum cover the happy path and one obvious edge case.
4. **End-to-end smoke test.** For changes that touch ingest, the repository, or the MCP wiring, re-run `npm run db:init && npm run db:import && npm run build` and verify a couple of tool calls land correctly via the JSON-RPC stdio transport.
5. **Commit hygiene.** One coherent change per commit; the message should explain *why*, not just *what*. PRs go through GitHub for review — never push directly to `main`.
