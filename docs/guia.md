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

Los archivos JSON en `data/` son la fuente de verdad local. El servidor no accede a internet en tiempo de ejecución.

### Importar desde InfoLEG

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

> Auditá siempre el corpus importado antes de usarlo en producción. El importador extrae estructura automáticamente, pero puede requerir ajustes manuales en `location`, `materia` e `incisos`.

---

## Ejecutar el servidor

```bash
# Modo desarrollo (sin compilar, usa tsx)
npm run dev

# Modo producción (requiere haber compilado antes)
npm run build
npm start

# Directorio de datos alternativo
ARGLEG_DATA_DIR=/otra/ruta/data npm start        # macOS/Linux
$env:ARGLEG_DATA_DIR="C:\otra\ruta\data"; npm start  # Windows PowerShell
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
        "ARGLEG_DATA_DIR": "/Users/TU_USUARIO/Desktop/mcp/data"
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
        "ARGLEG_DATA_DIR": "C:/Users/TU_USUARIO/Desktop/mcp/data"
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
        "ARGLEG_DATA_DIR": "/Users/TU_USUARIO/Desktop/mcp/data"
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
        "ARGLEG_DATA_DIR": "C:/Users/TU_USUARIO/Desktop/mcp/data"
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
        "ARGLEG_DATA_DIR": "/Users/TU_USUARIO/Desktop/mcp/data"
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
        "ARGLEG_DATA_DIR": "/Users/TU_USUARIO/Desktop/mcp/data"
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
Usá get_article con law=constitucion y article_number=14bis
```
```
Buscá artículos sobre "daño" en el CCyC
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
| `ARGLEG_DATA_DIR` | Ruta al directorio de archivos JSON | `~/Desktop/mcp/data` |
| `ARGLEG_LOG_LEVEL` | Nivel de log: `silent` \| `info` \| `verbose` \| `debug` | `info` |
| `ARGLEG_LOG_JSON` | `1` para emitir logs en formato JSONL | — |
| `ARGLEG_LOG_FILE` | Ruta a un archivo donde duplicar los logs | — |

---

## Logging

El servidor escribe logs exclusivamente en **stderr**. STDOUT está reservado para el transporte JSON-RPC de MCP.

```bash
# Ver cada llamada en tiempo real
ARGLEG_LOG_LEVEL=verbose npm start

# Debug completo con argumentos y tamaños de respuesta
ARGLEG_LOG_LEVEL=debug npm start

# Logs en formato JSON, guardados en archivo
ARGLEG_LOG_LEVEL=debug ARGLEG_LOG_JSON=1 ARGLEG_LOG_FILE=/tmp/argleg.jsonl npm start
```

### Dónde ver los logs según el cliente

| Cliente | Ubicación |
|---------|-----------|
| Claude Desktop (macOS) | `~/Library/Logs/Claude/mcp-server-argleg.log` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\logs\mcp-server-argleg.log` |
| Claude Code / Cursor | Logs MCP del propio cliente |
| MCP Inspector | Panel "stderr" en la UI web |

---

## Referencia de herramientas MCP

### `search_law`
Busca artículos por palabra clave, materia, capítulo o número exacto.
```json
{ "query": "persona humana", "law": "ccyc", "limit": 10 }
```

### `get_article`
Devuelve el texto completo de un artículo.
```json
{ "law": "constitucion", "article_number": "14bis" }
```

### `compare_articles`
Presenta dos artículos en paralelo para comparación textual.
```json
{ "law_a": "ccyc", "article_a": "1710", "law_b": "ley_24240", "article_b": "4" }
```

### `server_info`
Devuelve metadata del servidor: versión, fecha de build, normas cargadas.
```json
{}
```

---

## Seguridad

- El servidor es **solo lectura**. No escribe ni modifica archivos.
- No ejecuta comandos del sistema ni accede a internet en tiempo de ejecución.
- Todos los parámetros se validan con Zod antes de procesarse.
- La fuente de datos es exclusivamente el directorio local configurado.

---

## Licencia y copyright

Copyright © 2026 Guido Barosio.

Código de fuente abierta. Queda prohibido el **uso comercial** y la **integración en otros sistemas** sin autorización expresa del autor. Toda modificación debe canalizarse mediante pull request en el [repositorio oficial](https://github.com/gubaros/argleg). Ver [LICENSE](../LICENSE) para el texto completo.

Consultas: gbarosio@gmail.com
