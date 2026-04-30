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

The JSON files in `data/` are the local source of truth. The server does not access the internet at runtime.

### Import from InfoLEG

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
ARGLEG_DATA_DIR=/other/path/data npm start          # macOS/Linux
$env:ARGLEG_DATA_DIR="C:\other\path\data"; npm start  # Windows PowerShell
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
        "ARGLEG_DATA_DIR": "/Users/YOUR_USERNAME/Desktop/mcp/data"
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
        "ARGLEG_DATA_DIR": "C:/Users/YOUR_USERNAME/Desktop/mcp/data"
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
        "ARGLEG_DATA_DIR": "/Users/YOUR_USERNAME/Desktop/mcp/data"
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
        "ARGLEG_DATA_DIR": "C:/Users/YOUR_USERNAME/Desktop/mcp/data"
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
        "ARGLEG_DATA_DIR": "/Users/YOUR_USERNAME/Desktop/mcp/data"
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
        "ARGLEG_DATA_DIR": "/Users/YOUR_USERNAME/Desktop/mcp/data"
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
Use get_article with law=constitucion and article_number=14bis
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
| `ARGLEG_DATA_DIR` | Path to the JSON data directory | `~/Desktop/mcp/data` |
| `ARGLEG_LOG_LEVEL` | Log level: `silent` \| `info` \| `verbose` \| `debug` | `info` |
| `ARGLEG_LOG_JSON` | Set to `1` for JSONL log output | — |
| `ARGLEG_LOG_FILE` | Path to a file to duplicate log output | — |

---

## Logging

The server writes logs exclusively to **stderr**. STDOUT is reserved for the MCP JSON-RPC transport.

```bash
# Live call tracing
ARGLEG_LOG_LEVEL=verbose npm start

# Full debug with arguments and response sizes
ARGLEG_LOG_LEVEL=debug npm start

# JSON logs saved to file
ARGLEG_LOG_LEVEL=debug ARGLEG_LOG_JSON=1 ARGLEG_LOG_FILE=/tmp/argleg.jsonl npm start
```

### Log locations by client

| Client | Location |
|--------|----------|
| Claude Desktop (macOS) | `~/Library/Logs/Claude/mcp-server-argleg.log` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\logs\mcp-server-argleg.log` |
| Claude Code / Cursor | Check the client's own MCP logs |
| MCP Inspector | "stderr" panel in the web UI |

---

## MCP tools reference

### `search_law`
Search articles by keyword, subject, chapter or exact article number.
```json
{ "query": "persona humana", "law": "ccyc", "limit": 10 }
```

### `get_article`
Returns the full text of a specific article.
```json
{ "law": "constitucion", "article_number": "14bis" }
```

### `compare_articles`
Renders two articles side by side for textual comparison.
```json
{ "law_a": "ccyc", "article_a": "1710", "law_b": "ley_24240", "article_b": "4" }
```

### `server_info`
Returns server metadata: version, build date, loaded laws.
```json
{}
```

---

## Security

- The server is **read-only**. It does not write or modify any files.
- It does not execute system commands or access the internet at runtime.
- All parameters are validated with Zod before processing.
- The data source is exclusively the configured local directory.

---

## License and copyright

Copyright © 2026 Guido Barosio.

Open source code. **Commercial use** and **integration into other systems** are prohibited without express written authorization from the author. All modifications must be submitted via pull request to the [official repository](https://github.com/gubaros/argleg). See [LICENSE](../LICENSE) for the full text.

Contact: gbarosio@gmail.com
