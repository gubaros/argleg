# Technical Guide — Arg Leg MCP

Complete installation, configuration and usage documentation for **Arg Leg MCP**.

> Versión en español: [guia.md](guia.md)

---

## Requirements

| Requirement | Minimum version |
|-------------|----------------|
| Node.js | 20 |
| npm | 10 |

### Installing Node.js

**macOS**
```bash
# With Homebrew (recommended)
brew install node

# Or download the .pkg installer from https://nodejs.org
```

**Windows**
Download the installer from [nodejs.org](https://nodejs.org) and run it. Make sure to check *"Add to PATH"* during installation. Verify from PowerShell:
```powershell
node --version
npm --version
```

---

## Installation

### macOS

```bash
# 1. Clone the repository
git clone https://github.com/gubaros/argleg.git ~/Desktop/mcp
cd ~/Desktop/mcp

# 2. Install dependencies
npm install

# 3. Build
npm run build
```

### Windows

Open **PowerShell** and run:

```powershell
# 1. Clone the repository
git clone https://github.com/gubaros/argleg.git "$env:USERPROFILE\Desktop\mcp"
cd "$env:USERPROFILE\Desktop\mcp"

# 2. Install dependencies
npm install

# 3. Build
npm run build
```

> The working directory assumed in this guide is `~/Desktop/mcp` (macOS) or `%USERPROFILE%\Desktop\mcp` (Windows). Any other location works — just adjust the paths in the configuration steps below.

---

## Loading data (legislative corpus)

The runtime source of truth is the SQLite database at `data/argleg.db`. JSON files in `data/` feed that database. End-to-end flow:

```
InfoLEG (HTML)  →  npm run fetch   →  data/<law>.json
                                            ↓
                                     npm run db:import
                                            ↓
                                     data/argleg.db
                                            ↓
                                       MCP server
```

### 1. Create the SQLite database (once)

```bash
npm run db:init                   # creates data/argleg.db with the schema, idempotent
```

### 2. Import laws from InfoLEG (produces JSONs)

```bash
# Dry run — prints JSON to stdout without writing anything
npm run fetch -- --id ley_24240 \
  --url 'http://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/638/texact.htm' \
  --dry-run

# Write to disk
npm run fetch -- --id ccyc \
  --url 'http://servicios.infoleg.gob.ar/infolegInternet/anexos/235000-239999/235975/norma.htm' \
  --force

# From a previously downloaded local HTML file
npm run fetch -- --id penal --file ./penal.html --force
```

### 3. Load JSONs into SQLite

```bash
npm run db:import                 # incremental ingest (keeps existing rows)
npm run db:reset                  # wipe and reload everything from scratch
```

### Official URLs (InfoLEG, consolidated text)

| ID | URL |
|----|-----|
| `constitucion` | http://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/804/norma.htm |
| `ccyc` | http://servicios.infoleg.gob.ar/infolegInternet/anexos/235000-239999/235975/norma.htm |
| `penal` | http://servicios.infoleg.gob.ar/infolegInternet/anexos/15000-19999/16546/texact.htm |
| `cppf` | http://servicios.infoleg.gob.ar/infolegInternet/anexos/235000-239999/239340/norma.htm |
| `cpccn` | https://servicios.infoleg.gob.ar/infolegInternet/anexos/40000-44999/43797/texact.htm |
| `ley_24240` | http://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/638/texact.htm |
| `ley_19550` | https://servicios.infoleg.gob.ar/infolegInternet/anexos/25000-29999/25553/texact.htm |
| `ley_19549` | https://servicios.infoleg.gob.ar/infolegInternet/anexos/20000-24999/22363/texact.htm |
| `ley_25326` | https://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/texact.htm |

> Always audit the imported corpus before relying on it in production. The importer extracts structure automatically, but `location`, `materia`, and `incisos` fields may require manual review.

---

## Running the server

```bash
# Development mode (no build required, uses tsx)
npm run dev

# Production mode (requires a prior build)
npm run build
npm start

# Alternate data directory
ARGLEG_DB=/other/path/argleg.db npm start             # macOS/Linux
$env:ARGLEG_DB="C:\other\path\argleg.db"; npm start   # Windows PowerShell
```

---

## Connecting to an MCP client

### Claude Desktop

**macOS** — edit:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows** — edit:
```
%APPDATA%\Claude\claude_desktop_config.json
```

**macOS config**
```json
{
  "mcpServers": {
    "argleg": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/Desktop/mcp/dist/index.js"],
      "env": {
        "ARGLEG_DB": "/Users/YOUR_USERNAME/Desktop/mcp/data/argleg.db"
      }
    }
  }
}
```

**Windows config**
```json
{
  "mcpServers": {
    "argleg": {
      "command": "node",
      "args": ["C:/Users/YOUR_USERNAME/Desktop/mcp/dist/index.js"],
      "env": {
        "ARGLEG_DB": "C:/Users/YOUR_USERNAME/Desktop/mcp/data/argleg.db"
      }
    }
  }
}
```

Replace `YOUR_USERNAME` with your system username. Restart Claude Desktop — the `argleg` server will appear in the tools list.

---

### Claude Code (CLI)

Add to `.claude/settings.json` (project) or `~/.claude/settings.json` (global):

**macOS**
```json
{
  "mcpServers": {
    "argleg": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/Desktop/mcp/dist/index.js"],
      "env": {
        "ARGLEG_DB": "/Users/YOUR_USERNAME/Desktop/mcp/data/argleg.db"
      }
    }
  }
}
```

**Windows**
```json
{
  "mcpServers": {
    "argleg": {
      "command": "node",
      "args": ["C:/Users/YOUR_USERNAME/Desktop/mcp/dist/index.js"],
      "env": {
        "ARGLEG_DB": "C:/Users/YOUR_USERNAME/Desktop/mcp/data/argleg.db"
      }
    }
  }
}
```

Development mode (no build required):
```json
{
  "mcpServers": {
    "argleg": {
      "command": "npx",
      "args": ["tsx", "/Users/YOUR_USERNAME/Desktop/mcp/src/index.ts"],
      "env": {
        "ARGLEG_DB": "/Users/YOUR_USERNAME/Desktop/mcp/data/argleg.db"
      }
    }
  }
}
```

---

### Cursor / VS Code

In the workspace `settings.json`:

```json
{
  "mcp.servers": {
    "argleg": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/Desktop/mcp/dist/index.js"],
      "env": {
        "ARGLEG_DB": "/Users/YOUR_USERNAME/Desktop/mcp/data/argleg.db"
      }
    }
  }
}
```

---

### Verify the connection (MCP Inspector)

```bash
npx @modelcontextprotocol/inspector node /Users/YOUR_USERNAME/Desktop/mcp/dist/index.js
```

Opens a UI at `http://localhost:5173` where you can invoke tools, read resources, and call prompts interactively.

---

## Usage examples

Once the server is connected:

```
Use get_article with norma_id=constitucion and numero_articulo=14bis
```
```
Search for articles about "daño" in the CCyC
```
```
Compare article 79 of the Código Penal with article 4 of Ley 24.240
```
```
Apply the analisis_juridico prompt to article 1710 of the CCyC with context: civil liability on social media
```

---

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ARGLEG_DB` | Path to the SQLite database holding the corpus | `~/Desktop/mcp/data/argleg.db` |
| `ARGLEG_DATA_DIR` | Directory of source JSONs (used by ingest scripts only) | `~/Desktop/mcp/data` |
| `ARGLEG_LOG_LEVEL` | Log level: `silent` \| `info` \| `verbose` \| `debug` | `info` |
| `ARGLEG_LOG_JSON` | Set to `1` for JSONL log output | — |
| `ARGLEG_LOG_FILE` | Path to a file to duplicate log output | — |
| `ARGLEG_VALIDATE_VERBOSE` | Set to `1` to print every per-article warning during `db:import` | — |

---

## Logging

The server writes logs exclusively to **stderr**. STDOUT is reserved for the MCP JSON-RPC transport.

Three layers of events are emitted:

1. **Protocol layer** (`rpc.request`, `rpc.notification`) — every inbound JSON-RPC message, including handshake traffic like `initialize`, `tools/list`, `ping`. Visible from `verbose` upwards.
2. **Handler layer** (`tool.call`, `tool.done`, `tool.error`, `resource.*`, `prompt.*`) — every tool/resource/prompt invocation, with timing.
3. **Lifecycle** (`server.loading`, `server.norma_loaded`, `server.ready`, `server.started`, `server.fatal`).

Every log line emitted **after** the `initialize` handshake also carries a `client={"name":"…","version":"…"}` field, populated from the `clientInfo` block the MCP client sends. This lets you tell which client (Claude Desktop, Claude Code, Cursor, …) made each call when grepping logs.

```bash
# Live request tracing + tool calls
ARGLEG_LOG_LEVEL=verbose npm start

# Full debug: notifications, args, response sizes
ARGLEG_LOG_LEVEL=debug npm start

# JSON logs saved to file
ARGLEG_LOG_LEVEL=debug ARGLEG_LOG_JSON=1 ARGLEG_LOG_FILE=/tmp/argleg.jsonl npm start

# Filter all calls made by Claude Code only
ARGLEG_LOG_LEVEL=verbose ARGLEG_LOG_JSON=1 npm start 2>&1 | jq 'select(.client.name == "claude-code")'
```

> When the server runs as a child of Claude Desktop, that client captures stderr. Set `ARGLEG_LOG_FILE=/tmp/argleg-mcp.log` and `tail -f` it from another terminal to see live traffic.

### Log locations by client

| Client | Location |
|--------|----------|
| Claude Desktop (macOS) | `~/Library/Logs/Claude/mcp-server-argleg.log` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\logs\mcp-server-argleg.log` |
| Claude Code / Cursor | Check the client's own MCP logs |
| MCP Inspector | "stderr" panel in the web UI |

---

## MCP tools reference

> **Note on `norma_id`**: tools accept lossless variants (case, whitespace, dashes, dots). `"Ley 19.549"`, `"LEY-19.549"` and `"ley_19549"` all resolve to the same row. When an id isn't recognized and a single near-match exists, the response includes `¿Quisiste decir \`<id>\`?` plus a `suggestion` field in `structuredContent` so clients can auto-recover. Bare numbers like `"19549"` do not auto-map to `ley_19549` (conservative policy) — but they do trigger the suggestion.

### `list_norms`
Lists the laws available in the database. Filters by **tier** of the Argentine legal pyramid (`constitucion_nacional`, `codigo_fondo`, `codigo_procesal_federal`, `ley_federal`, `constitucion_provincial`, `constitucion_caba`, etc.), subject or currency status.
```json
{ "tier": "ley_federal", "estado_vigencia": "vigente" }
```

### `get_norm_metadata`
Returns full metadata for a law plus a structural summary (levels present, count of titles/chapters/sections, max depth).
```json
{ "norma_id": "ccyc" }
```

### `get_article`
Returns the full text of an article and its structural context.
```json
{ "norma_id": "constitucion", "numero_articulo": "14bis" }
```

### `search_articles`
Search articles by keyword or number; filter optionally by law.
```json
{ "query": "persona humana", "norma_id": "ccyc", "limit": 10 }
```

### `list_sections`
Returns the full structural tree of a norma (parts / books / titles / chapters / sections), indented, with each node's internal id.
```json
{ "norma_id": "constitucion" }
```

### `get_section`
Returns one structural section together with every article it contains. The `identificador` can be the node's internal id or a substring of its name.
```json
{ "norma_id": "constitucion", "identificador": "Nuevos derechos" }
```
For example, returns the 8 articles of Capítulo Segundo (arts. 36-43) in a single call.

### `list_ramas`
Lists the branches of law the MCP covers with principles, doctrine and norm cross-references.
```json
{}
```

### `get_rama_metadata`
Returns legal metadata for a branch: fundamental principles (with their source and currency), norms that apply (with relevance: nuclear / complementary / tangential), representative doctrine and case law (when curated).
```json
{ "rama_id": "derecho_civil" }
```

### `compare_articles`
Renders two articles side by side for textual comparison.
```json
{ "norma_a": "ccyc", "articulo_a": "1710", "norma_b": "ley_24240", "articulo_b": "4" }
```

### `server_info`
Returns server metadata: version, build date, SQLite path, loaded laws.
```json
{}
```

---

## Security

- The server is **read-only**. It does not write or modify any files.
- It does not execute system commands or access the internet at runtime.
- All parameters are validated with Zod before processing.
- The data source is exclusively the configured local SQLite database.

---

## License and copyright

Copyright © 2026 Guido Barosio.

Open source code. **Commercial use** and **integration into other systems** are prohibited without express written authorization from the author. All modifications must be submitted via pull request to the [official repository](https://github.com/gubaros/argleg). See [LICENSE](../LICENSE) for the full text.

Contact: gbarosio@gmail.com
