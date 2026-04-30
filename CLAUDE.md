# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**argleg-mcp** is a read-only MCP (Model Context Protocol) server that exposes Argentine legislation to MCP clients (Claude Desktop, Claude Code, Cursor, etc.). All data comes from local JSON files in `data/` — the server never reads from the internet at runtime.

## Commands

```bash
npm run dev          # run without compiling (uses tsx)
npm run build        # compile TypeScript → dist/
npm start            # run compiled server
npm test             # run all tests (vitest)
npm run test:watch   # watch mode
npm run typecheck    # tsc --noEmit, no output files
npm run fetch -- --id <lawId> --url <URL> [--dry-run] [--force]  # import a law from InfoLEG
```

Run a single test file:
```bash
npx vitest run tests/search.test.ts
```

The `prebuild` hook auto-bumps `src/version.ts` via `scripts/bump-version.mjs` on every `npm run build`.

## Architecture

### Data flow

```
data/*.json  →  src/laws/loader.ts (loadLibrary)  →  LoadedLibrary (Map<LawId, Law>)
                                                         ↓
src/server.ts (buildServer)  ←  registerTools / registerResources / registerPrompts
                                                         ↓
                                               MCP transport (stdio)
```

- **`src/laws/types.ts`** — canonical Zod schemas and TypeScript types (`Law`, `Article`, `Inciso`, `ArticleLocation`, `LawId`). Every JSON in `data/` is validated against `LawSchema` at load time.
- **`src/laws/loader.ts`** — reads all JSON files from `ARGLEG_DATA_DIR` (default: `~/Desktop/mcp/data`). Returns a `LoadedLibrary` with `laws` (loaded), `missing` (file not found), and `errors` (parse failures). `findArticle` normalizes article numbers (strips "art.", lowercases, collapses spaces) before comparing.
- **`src/laws/search.ts`** — pure scoring function over `LoadedLibrary`. Tokens are accent-folded (`foldText`). Score weights: exact article number match = 50, title = 10, `materia` tags = 6, `capitulo`/`titulo` = 4, body text = 3, `incisos` = 2.
- **`src/laws/format.ts`** — renders `Article` and `SearchHit` to Markdown strings for MCP responses.
- **`src/server.ts`** — wires everything together. Registers 4 tools (`server_info`, `search_law`, `get_article`, `compare_articles`), static resources per law (`law://<id>`), a template resource (`law://{id}/article/{number}`), and 2 prompts (`analisis_juridico`, `comparacion_normativa`). All tool/resource/prompt calls go through `runToolLogged` / `runResourceLogged` / `runPromptLogged` helpers for structured logging.
- **`src/log.ts`** — writes only to **stderr** (never stdout, which is reserved for MCP JSON-RPC). Controlled by `ARGLEG_LOG_LEVEL` (`silent` | `info` | `verbose` | `debug`) and `ARGLEG_LOG_JSON=1`.

### Corpus importers (`src/scripts/`)

`fetch-infoleg.ts` is a CLI that downloads a law from InfoLEG (or reads a local HTML file), runs it through the appropriate parser, and writes a validated JSON to `data/`. The dispatcher is `src/scripts/parsers/index.ts` — each law has its own parser (`ccyc.ts`, `constitucion.ts`, etc.) built on top of shared utilities in `src/scripts/parsers/base.ts` (`htmlToText`, `parseArticles`, `updateContextFromLine`, `ARTICLE_RE`).

Adding a new law requires: a new parser in `src/scripts/parsers/`, registering it in `parsers/index.ts`, adding the `LawId` to `LawIdSchema` and `LAW_IDS` in `types.ts`, adding an entry to `LAW_FILE_BY_ID`, and adding defaults to `fetch-infoleg.ts`.

### Key constraints

- **stdout is sacred**: the MCP stdio transport uses stdout exclusively. All logging must go to stderr.
- **No runtime network access**: the server only reads local files. The `fetch-infoleg` script is a build-time utility, not called by the server.
- Data directory resolution order: `LoaderOptions.dataDir` → `ARGLEG_DATA_DIR` env var → `~/Desktop/mcp/data`.
- Article numbers are strings (supports `14bis`, `75 inc. 22`, etc.) and are normalized for comparison via `normalizeNumber`.

## Environment variables

| Variable | Purpose |
|---|---|
| `ARGLEG_DATA_DIR` | Override default data directory |
| `ARGLEG_LOG_LEVEL` | `silent` \| `info` (default) \| `verbose` \| `debug` |
| `ARGLEG_LOG_JSON` | Set to `1` for JSONL log output |
| `ARGLEG_LOG_FILE` | Path to duplicate log output to a file |
