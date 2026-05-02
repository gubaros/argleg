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
- **`src/scripts/db-import.ts`** — `npm run db:import`. Reads JSONs via `loadLibrary()`, validates them (warnings vs fatal errors), inserts everything in a single transaction. Resolves each norma's `tier` from `TIER_BY_NORMA_ID` (fails loudly if undeclared), and assigns `estado_vigencia` from a curated `VIGENCIA_BY_NORMA_ID` map (defaults to `desconocido` for normas not in the map). Exports `importIntoDb(db, laws, opts)` for tests.
- **`src/server.ts`** — `buildServer({ dbPath?, repository? })`. Opens the DB (or accepts an injected repo for tests), registers ten tools (see *MCP surface* below), the per-norma resources, the article template, and two prompts. Each handler goes through `runToolLogged` / `runResourceLogged` / `runPromptLogged`.
- **`src/index.ts`** — stdio entrypoint. Installs `transport.onmessage = logRpcMessage` **before** `server.connect()` so every inbound JSON-RPC message is logged at the protocol layer (see Logging below).
- **`src/log.ts`** — writes only to stderr. Levels: `silent` | `info` | `verbose` | `debug`. Optional JSON output and file mirroring.

### Legal hierarchy as data (`src/laws/hierarchy.ts`)

The Argentine legal pyramid is encoded as a typed model: 15 `LegalTier` values from `constitucion_nacional` (top) to `ordenanza_municipal` (bottom), each with a profile (kelsen rank, ámbito, emisor, base constitucional, allowed structural levels, header detection regexes). `TIER_BY_NORMA_ID` maps every corpus norma to its tier, including the 23 provincial constitutions and CABA. The `PROVINCIAS` catalogue lists the 24 jurisdictions with metadata for the ingest workflow (see [docs/provincial-constitutions.md](docs/provincial-constitutions.md)). A norma cannot be ingested unless its id is declared in `TIER_BY_NORMA_ID` first.

### Structural-header recovery at ingest (`src/scripts/parsers/structural-headers.ts`)

The legacy per-law parsers (still active for the JSON corpus of constitucion / penal / ley_19549 / ley_19550 / ley_24240 / ley_25326) didn't recognise InfoLEG's section markers — strings like `"PRIMERA PARTE"`, `"LIBRO PRIMERO"`, `"TÍTULO PRELIMINAR"`, `"CAPÍTULO SEGUNDO"`. As a result those headers got concatenated to the END of the previous article's text and `Article.location` was left empty. `db-import` runs `splitArticleHeaders` and `trimTrailingOrphans` on each ingested article to (a) clean the body of trailing-header noise and (b) reconstruct the structural hierarchy by promoting detected headers to `estructura_normativa` rows. This is what makes `get_section`/`list_sections` work on normas whose source JSON has empty `location`.

The cleaning pass runs in two phases: a line-based detector that walks from the first structural keyword to end-of-text and consumes all keyword + subtitle pairs (plus orphan all-caps lines that morally belong to a section but lost their keyword upstream, e.g. "DEL PODER LEGISLATIVO"); and a regex pass that strips trailing all-caps phrases sharing a line with body text (e.g. inciso `d) ... sin autorización. EL CIVILMENTE DEMANDADO`).

### Universal parser (`src/laws/universal-parser.ts`)

Single tier-aware parser that replaces per-law parsers. `parseDocument(html, tier)` returns `{ articles, structure, warnings }` regardless of input tier. Header detection is driven by `TIER_PROFILES[tier].niveles_posibles`; the parser walks the document linearly, maintains a stack of open structural nodes, normalises soft-wrap newlines mid-sentence, and emits coherence warnings if a level outside the tier's allowed set shows up. Mode (a)+(b): operator declares the tier; parser verifies via `verifyTierAgainstText` and warns on mismatch.

### Intelligence layer (`src/db/seeds/intelligence.ts`)

Six tables extend the corpus with curated legal knowledge:

- `ramas_derecho` — 8 branches of law (constitucional, civil, comercial, penal, procesal, administrativo, consumidor, protección de datos) with descripción + ámbito.
- `principios_juridicos` — 17 fundamental principles per branch, with enunciado, fuente normativa or doctrinaria, and vigencia (`positivado`/`dogmatico`/`controvertido`).
- `norma_rama` — many-to-many link between norms and branches, with `relevancia` (nuclear/complementaria/tangencial). 15 links seeded.
- `doctrina` — 10 canonical authors and works.
- `jurisprudencia` and `jurisprudencia_norma` — schema is ready, content curation is pending.

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
| tool | `list_sections` | `{ norma_id }` |
| tool | `get_section` | `{ norma_id, identificador }` |
| resource | `law://<norma_id>` | per-norma summary |
| resource template | `law://{id}/article/{number}` | individual article |
| prompt | `analisis_juridico` | `{ norma_id, numero_articulo, context? }` |
| prompt | `comparacion_normativa` | `{ norma_a, articulo_a, norma_b, articulo_b, focus? }` |

### Corpus importers (`src/scripts/`)

`fetch-infoleg.ts` is a CLI that downloads a law from InfoLEG (or reads a local HTML file), runs it through the appropriate parser, and writes a validated JSON to `data/`. The dispatcher is `src/scripts/parsers/index.ts` — each law has its own parser (`ccyc.ts`, `constitucion.ts`, `ley_25326.ts`, etc.) built on top of shared utilities in `src/scripts/parsers/base.ts` (`htmlToText`, `parseArticles`, `updateContextFromLine`, `ARTICLE_RE`).

Adding a new norma to the corpus requires touching three independent gatekeepers:

1. **Hierarchy declaration** (gatekeeper for `db-import`) — add the `norma_id` to `TIER_BY_NORMA_ID` in `src/laws/hierarchy.ts` with its tier. `db-import` refuses to ingest any norma not declared here.
2. **Legacy validation** (gatekeeper for `loadLibrary`) — add the id to `LawIdSchema`, `LAW_IDS`, and `LAW_FILE_BY_ID` in `src/laws/types.ts`. The Zod schema validates the JSON file at load time.
3. **Legacy fetch parser** (gatekeeper for `npm run fetch`) — add a parser to `src/scripts/parsers/<id>.ts`, register it in the `parseLawHtml` switch in `parsers/index.ts`, and add display defaults to `DEFAULT_TITLES` in `fetch-infoleg.ts`.
4. **Optionally** — add an entry to `VIGENCIA_BY_NORMA_ID` in `db-import.ts` if the norma is currently in force (default is `desconocido`).
5. Then run: `npm run fetch -- --id <id> --url <URL> --force` to produce the JSON, followed by `npm run db:reset` to push it into SQLite.

The universal parser at `src/laws/universal-parser.ts` is the eventual replacement for steps 2–3 (legacy paths), but `fetch-infoleg.ts` still routes through `extractArticlesForLaw` → per-law parsers, so until that's wired, all three gatekeepers remain required.

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

Before opening or merging a PR, **review and update** in this order:

### 1. README.md (non-negotiable when public surface changes)

The `README.md` at the repo root is the entry point for everyone landing on the project — readers, contributors, the Palermo E-Law team. **It must stay in sync with the public surface in the same PR that changes the surface.** A README out of sync with reality is a documentation bug, not "something to fix later".

Update README.md if your change touches *any* of:

- The list of MCP tools, resources, or prompts (their names, inputs, or what they do)
- The list of normas in the corpus (additions, removals, vigencia changes)
- The pirámide normativa (a new tier, a new ámbito)
- Commands or scripts (a new `npm run` target, a renamed one)
- Environment variables (a new `ARGLEG_*` var, a renamed default)
- The architecture diagram or data flow (a new module that's user-visible, a removed one)
- The "Cómo agregar leyes" workflow

When in doubt, open the README and re-read it against the change. If anything reads as stale, fix it before pushing the PR.

### 2. Other documentation

After README.md, walk through the rest of the `.md` files:

- `CLAUDE.md` (this file) — the source of truth for Claude Code agents working in this repo.
- `docs/guia.md` (Spanish) and `docs/guide.md` (English) — the user-facing onboarding guides. **These two must stay in sync** with each other; never update one without the other.
- `docs/provincial-constitutions.md` — workflow for ingesting provincial constitutions.
- `BACKLOG.md` — operational backlog. Move items off when shipped, add follow-ups when discovered.
- `docs/connect.md` — short redirect to the guides.

If your change touches commands, scripts, env vars, the MCP surface, data flow, or the file layout, update **every** doc that mentions that area.

### 3. Logging

If behaviour changed at the protocol, handler, or lifecycle layer, the corresponding log event should reflect it. New env vars or runtime decisions are often worth a `log.info` at startup. Verify by running `ARGLEG_LOG_LEVEL=verbose npm start` (or piping JSON-RPC messages into `node dist/index.js`) and reading stderr.

### 4. Tests

Run `npm test` and `npm run typecheck`. New code paths warrant new tests — at minimum cover the happy path and one obvious edge case. Aim to keep coverage of the structural-headers parser and the repository at 100% — those modules are load-bearing and silent regressions are expensive.

### 5. End-to-end smoke test

For changes that touch ingest, the repository, or the MCP wiring, re-run:

```bash
rm -f data/argleg.db data/argleg.db-shm data/argleg.db-wal
npm run db:init && npm run db:import && npm run build
```

Then pipe a couple of `tools/call` messages into `node dist/index.js` via stdio JSON-RPC and verify the responses. The smoke test is more reliable than `npm test` for catching wiring bugs at the MCP boundary.

### 6. Commit hygiene

One coherent change per commit; the message should explain *why*, not just *what*. PRs go through GitHub for review — **never push directly to `main`**. Branch naming convention:

- `feat/<short-noun-phrase>` for new features (e.g., `feat/ley-25326`)
- `fix/<short-noun-phrase>` for bug fixes (e.g., `fix/structural-headers-and-vigencia`)
- `refactor/<short-noun-phrase>` for refactors (e.g., `refactor/sqlite-source-of-truth`)
- `docs/<short-noun-phrase>` for doc-only changes (e.g., `docs/readme-update`)

The `gh` CLI in this environment is authenticated as a different user than the repo owner, so PR creation via `gh pr create` will fail. After pushing the branch, surface the GitHub PR-creation URL (`https://github.com/gubaros/argleg/pull/new/<branch>`) so the operator can open it manually.
