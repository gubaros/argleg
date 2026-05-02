# Guía técnica — Arg Leg MCP

Documentación completa de instalación, configuración y uso de **Arg Leg MCP**.

> Versión en inglés: [guide.md](guide.md)

---

## Requisitos

| Requisito | Versión mínima |
|-----------|---------------|
| Node.js | 20 |
| npm | 10 |

### Instalar Node.js

**macOS**
```bash
# Con Homebrew (recomendado)
brew install node

# O descargarlo desde https://nodejs.org (instalador .pkg)
```

**Windows**
Descargá el instalador desde [nodejs.org](https://nodejs.org) y ejecutalo. Asegurate de marcar la opción *"Add to PATH"* durante la instalación. Una vez instalado, verificá desde PowerShell:
```powershell
node --version
npm --version
```

---

## Instalación

### macOS

```bash
# 1. Clonar el repositorio
git clone https://github.com/gubaros/argleg.git ~/Desktop/mcp
cd ~/Desktop/mcp

# 2. Instalar dependencias
npm install

# 3. Compilar
npm run build
```

### Windows

Abrí **PowerShell** y ejecutá:

```powershell
# 1. Clonar el repositorio
git clone https://github.com/gubaros/argleg.git "$env:USERPROFILE\Desktop\mcp"
cd "$env:USERPROFILE\Desktop\mcp"

# 2. Instalar dependencias
npm install

# 3. Compilar
npm run build
```

> El directorio de trabajo asumido en esta guía es `~/Desktop/mcp` (macOS) o `%USERPROFILE%\Desktop\mcp` (Windows). Podés usar cualquier otra ubicación ajustando las rutas en los pasos de configuración.

---

## Cargar datos (corpus legislativo)

La fuente de verdad operativa es la base SQLite `data/argleg.db`. Los archivos JSON en `data/` son la entrada que alimenta esa base. Flujo completo:

```
InfoLEG (HTML)  →  npm run fetch   →  data/<ley>.json
                                            ↓
                                     npm run db:import
                                            ↓
                                     data/argleg.db
                                            ↓
                                       MCP server
```

### 1. Crear la base SQLite (una sola vez)

```bash
npm run db:init                   # crea data/argleg.db con el schema, idempotente
```

### 2. Importar leyes desde InfoLEG (genera JSONs)

```bash
# Vista previa (no escribe nada, imprime el JSON por stdout)
npm run fetch -- --id ley_24240 \
  --url 'http://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/638/texact.htm' \
  --dry-run

# Escritura real
npm run fetch -- --id ccyc \
  --url 'http://servicios.infoleg.gob.ar/infolegInternet/anexos/235000-239999/235975/norma.htm' \
  --force

# Desde un HTML local descargado previamente
npm run fetch -- --id penal --file ./penal.html --force
```

### 3. Cargar los JSON en SQLite

```bash
npm run db:import                 # ingesta incremental (deja datos previos)
npm run db:reset                  # limpia y recarga todo desde cero
```

### URLs oficiales (InfoLEG, texto actualizado)

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

> Auditá siempre el corpus importado antes de usarlo en producción. El importador extrae estructura automáticamente, pero puede requerir ajustes manuales en `location`, `materia` e `incisos`.

---

## Ejecutar el servidor

```bash
# Modo desarrollo (sin compilar, usa tsx)
npm run dev

# Modo producción (requiere haber compilado antes)
npm run build
npm start

# Base de datos alternativa (path absoluto)
ARGLEG_DB=/otra/ruta/argleg.db npm start             # macOS/Linux
$env:ARGLEG_DB="C:\otra\ruta\argleg.db"; npm start   # Windows PowerShell
```

---

## Conectar a un cliente MCP

### Claude Desktop

**macOS** — editá el archivo:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows** — editá el archivo:
```
%APPDATA%\Claude\claude_desktop_config.json
```

Contenido (ajustá la ruta a donde clonaste el repositorio):

**macOS**
```json
{
  "mcpServers": {
    "argleg": {
      "command": "node",
      "args": ["/Users/TU_USUARIO/Desktop/mcp/dist/index.js"],
      "env": {
        "ARGLEG_DB": "/Users/TU_USUARIO/Desktop/mcp/data/argleg.db"
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
      "args": ["C:/Users/TU_USUARIO/Desktop/mcp/dist/index.js"],
      "env": {
        "ARGLEG_DB": "C:/Users/TU_USUARIO/Desktop/mcp/data/argleg.db"
      }
    }
  }
}
```

Reemplazá `TU_USUARIO` con tu nombre de usuario. Reiniciá Claude Desktop para que tome los cambios. El servidor `argleg` aparecerá en la lista de herramientas disponibles.

---

### Claude Code (CLI)

Agregá la configuración en `.claude/settings.json` (proyecto) o `~/.claude/settings.json` (global):

**macOS**
```json
{
  "mcpServers": {
    "argleg": {
      "command": "node",
      "args": ["/Users/TU_USUARIO/Desktop/mcp/dist/index.js"],
      "env": {
        "ARGLEG_DB": "/Users/TU_USUARIO/Desktop/mcp/data/argleg.db"
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
      "args": ["C:/Users/TU_USUARIO/Desktop/mcp/dist/index.js"],
      "env": {
        "ARGLEG_DB": "C:/Users/TU_USUARIO/Desktop/mcp/data/argleg.db"
      }
    }
  }
}
```

Para desarrollo sin compilar (usando `tsx`):
```json
{
  "mcpServers": {
    "argleg": {
      "command": "npx",
      "args": ["tsx", "/Users/TU_USUARIO/Desktop/mcp/src/index.ts"],
      "env": {
        "ARGLEG_DB": "/Users/TU_USUARIO/Desktop/mcp/data/argleg.db"
      }
    }
  }
}
```

---

### Cursor / VS Code

En `settings.json` del workspace:

```json
{
  "mcp.servers": {
    "argleg": {
      "command": "node",
      "args": ["/Users/TU_USUARIO/Desktop/mcp/dist/index.js"],
      "env": {
        "ARGLEG_DB": "/Users/TU_USUARIO/Desktop/mcp/data/argleg.db"
      }
    }
  }
}
```

---

### Verificar la conexión (MCP Inspector)

```bash
npx @modelcontextprotocol/inspector node /Users/TU_USUARIO/Desktop/mcp/dist/index.js
```

Abre una UI en `http://localhost:5173` donde podés ejecutar herramientas, leer recursos y llamar prompts de forma interactiva.

---

## Ejemplos de uso en el chat

Una vez conectado el servidor, podés escribir en el chat:

```
Usá get_article con norma_id=constitucion y numero_articulo=14bis
```
```
Buscá artículos sobre "daño" en el CCyC
```
```
Mostrame qué normas hay con list_norms
```
```
Compará el artículo 79 del Código Penal con el artículo 4 de la Ley 24.240
```
```
Aplicá el prompt analisis_juridico al artículo 1710 del CCyC con el contexto: responsabilidad civil en redes sociales
```

---

## Variables de entorno

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `ARGLEG_DB` | Ruta al archivo SQLite con el corpus | `~/Desktop/mcp/data/argleg.db` |
| `ARGLEG_DATA_DIR` | Directorio con los JSON fuente (usado solo por los scripts de ingesta) | `~/Desktop/mcp/data` |
| `ARGLEG_LOG_LEVEL` | Nivel de log: `silent` \| `info` \| `verbose` \| `debug` | `info` |
| `ARGLEG_LOG_JSON` | `1` para emitir logs en formato JSONL | — |
| `ARGLEG_LOG_FILE` | Ruta a un archivo donde duplicar los logs | — |
| `ARGLEG_VALIDATE_VERBOSE` | `1` para imprimir cada warning de validación durante `db:import` | — |

---

## Logging

El servidor escribe logs exclusivamente en **stderr**. STDOUT está reservado para el transporte JSON-RPC de MCP.

Hay tres capas de eventos:

1. **Protocolo** (`rpc.request`, `rpc.notification`) — todo mensaje JSON-RPC entrante, incluso `initialize`, `tools/list`, `ping`, etc., visibles a partir de `verbose`.
2. **Handlers** (`tool.call`, `tool.done`, `tool.error`, `resource.*`, `prompt.*`) — cada invocación de tool/resource/prompt, con timing.
3. **Lifecycle** (`server.loading`, `server.norma_loaded`, `server.ready`, `server.started`, `server.fatal`).

Cada línea emitida **después** del handshake `initialize` también lleva un campo `client={"name":"…","version":"…"}`, tomado del bloque `clientInfo` que envía el cliente MCP. Esto permite saber qué cliente (Claude Desktop, Claude Code, Cursor, …) hizo cada llamada al grepear los logs.

```bash
# Ver cada request entrante + cada llamada a tool
ARGLEG_LOG_LEVEL=verbose npm start

# Debug completo: incluye notifications, args y tamaños de respuesta
ARGLEG_LOG_LEVEL=debug npm start

# Logs en formato JSON, guardados en archivo
ARGLEG_LOG_LEVEL=debug ARGLEG_LOG_JSON=1 ARGLEG_LOG_FILE=/tmp/argleg.jsonl npm start

# Filtrar solo las llamadas hechas por Claude Code
ARGLEG_LOG_LEVEL=verbose ARGLEG_LOG_JSON=1 npm start 2>&1 | jq 'select(.client.name == "claude-code")'
```

> Si lanzás el servidor desde Claude Desktop, su stderr queda capturado por el cliente. Para ver los logs en vivo, usá `ARGLEG_LOG_FILE=/tmp/argleg-mcp.log` y en otra terminal corré `tail -f /tmp/argleg-mcp.log`.

### Dónde ver los logs según el cliente

| Cliente | Ubicación |
|---------|-----------|
| Claude Desktop (macOS) | `~/Library/Logs/Claude/mcp-server-argleg.log` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\logs\mcp-server-argleg.log` |
| Claude Code / Cursor | Logs MCP del propio cliente |
| MCP Inspector | Panel "stderr" en la UI web |

---

## Referencia de herramientas MCP

### `list_norms`
Lista las normas cargadas. Filtra por **tier** de la pirámide normativa argentina (`constitucion_nacional`, `codigo_fondo`, `codigo_procesal_federal`, `ley_federal`, `constitucion_provincial`, `constitucion_caba`, etc.), materia o estado de vigencia.
```json
{ "tier": "ley_federal", "estado_vigencia": "vigente" }
```

### `get_norm_metadata`
Devuelve la metadata completa de una norma más un resumen estructural (niveles presentes, cantidad de capítulos/títulos/secciones, profundidad).
```json
{ "norma_id": "ccyc" }
```

### `get_article`
Devuelve el texto completo de un artículo y su contexto estructural.
```json
{ "norma_id": "constitucion", "numero_articulo": "14bis" }
```

### `search_articles`
Busca artículos por palabra clave o número. Acepta filtro por norma.
```json
{ "query": "persona humana", "norma_id": "ccyc", "limit": 10 }
```

### `list_sections`
Devuelve el árbol estructural completo de una norma (partes / libros / títulos / capítulos / secciones), en formato indentado con el `id` interno de cada nodo.
```json
{ "norma_id": "constitucion" }
```

### `get_section`
Devuelve una sección estructural más todos los artículos que contiene. El `identificador` puede ser el id interno del nodo o un substring del nombre.
```json
{ "norma_id": "constitucion", "identificador": "Nuevos derechos" }
```
Devuelve, por ejemplo, los 8 artículos del Capítulo Segundo (arts. 36-43) en una sola llamada.

### `list_ramas`
Lista las ramas del derecho que el MCP cubre con principios, doctrina y referencias normativas.
```json
{}
```

### `get_rama_metadata`
Devuelve la metadata jurídica de una rama: principios fundamentales (con su fuente y vigencia), normas que aplican (con relevancia nuclear / complementaria / tangencial), doctrina representativa y jurisprudencia (cuando esté curada).
```json
{ "rama_id": "derecho_civil" }
```

### `compare_articles`
Presenta dos artículos en paralelo para comparación textual.
```json
{ "norma_a": "ccyc", "articulo_a": "1710", "norma_b": "ley_24240", "articulo_b": "4" }
```

### `server_info`
Devuelve metadata del servidor: versión, fecha de build, ruta de la base SQLite, normas cargadas.
```json
{}
```

---

## Seguridad

- El servidor es **solo lectura**. No escribe ni modifica archivos.
- No ejecuta comandos del sistema ni accede a internet en tiempo de ejecución.
- Todos los parámetros se validan con Zod antes de procesarse.
- La fuente de datos es exclusivamente la base SQLite local configurada.

---

## Licencia y copyright

Copyright © 2026 Guido Barosio.

Código de fuente abierta. Queda prohibido el **uso comercial** y la **integración en otros sistemas** sin autorización expresa del autor. Toda modificación debe canalizarse mediante pull request en el [repositorio oficial](https://github.com/gubaros/argleg). Ver [LICENSE](../LICENSE) para el texto completo.

Consultas: gbarosio@gmail.com
