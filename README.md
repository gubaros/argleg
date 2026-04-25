# Argleg MCP
Autor: Guido Barosio
Servidor MCP de solo lectura para consultar legislación argentina desde archivos locales.

> **Aviso legal:** Este servidor es una herramienta orientativa. El contenido normativo proviene exclusivamente de archivos locales que vos cargás. No sustituye el asesoramiento profesional de un abogado matriculado. Verificá siempre el texto vigente en fuentes oficiales (InfoLEG, BORA).

---

## Normas incluidas

| ID | Nombre | Número oficial |
|----|--------|----------------|
| `constitucion` | Constitución de la Nación Argentina | Texto 1994 |
| `ccyc` | Código Civil y Comercial | Ley 26.994 |
| `penal` | Código Penal | Ley 11.179 |
| `cppf` | Código Procesal Penal Federal | Ley 27.063 |
| `cpccn` | Código Procesal Civil y Comercial de la Nación | Ley 17.454 |
| `ley_24240` | Ley de Defensa del Consumidor | Ley 24.240 |
| `ley_19550` | Ley General de Sociedades | Ley 19.550 |
| `ley_19549` | Ley Nacional de Procedimientos Administrativos | Ley 19.549 |

---

## Requisitos

- Node.js ≥ 20
- npm ≥ 10

---

## Instalación

```bash
cd ~/Desktop/mcp
npm install
npm run build
```

---

## Cargar datos reales

Los archivos en `data/` son la fuente de verdad local del servidor.
Pueden generarse desde HTML locales o desde InfoLEG con `fetch-infoleg`, y después se versionan si quieres conservar el corpus regenerado.

### Auto-importar desde InfoLEG

El proyecto incluye un script `fetch-infoleg` que descarga una norma desde InfoLEG
y genera el JSON automáticamente.

**Importante:** a partir de esta versión, cada corpus pasa por su propio parser.
No todos tienen el mismo nivel de madurez todavía:

- `ccyc` → parser específico + `location` + incisos + log auditable
- `cppf` → parser específico + `location` + incisos + log auditable
- `constitucion` → parser específico + incisos numerados
- `penal` → parser específico + incisos + log auditable
- `cpccn` → parser específico + `location`
- `ley_24240` → parser dedicado por archivo
- `ley_19549` → parser específico + incisos + log auditable
- `ley_19550` → parser específico + incisos + log auditable

La arquitectura ya no usa un único parser compartido para todas las normas.

```bash
# dry-run: imprime el JSON por stdout sin escribir nada
npm run fetch -- --id ley_24240 \
  --url 'http://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/638/texact.htm' \
  --dry-run

# Escritura real (pide --force si el archivo existe)
npm run fetch -- --id ccyc \
  --url 'http://servicios.infoleg.gob.ar/infolegInternet/anexos/235000-239999/235975/norma.htm' \
  --force

# También se puede leer un HTML local previamente descargado:
npm run fetch -- --id penal --file ./penal.html --force
```

URLs sugeridas (InfoLEG texto actualizado):

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

> **Es un importador con parsers específicos por corpus.** El servidor ya extrae parte de la estructura (`location`, `incisos`) en varias normas, pero sigue siendo recomendable auditar cada corpus regenerado antes de depender de él en producción.

### Formato de cada archivo JSON

```jsonc
{
  "id": "ccyc",                         // ID canónico (no cambiar)
  "title": "Nombre completo",
  "shortName": "CCyC",
  "officialNumber": "Ley 26.994",
  "source": "URL fuente oficial",
  "lastUpdated": "2026-04-23",          // ISO: cuándo actualizaste el archivo
  "description": "Descripción breve",
  "articles": [
    {
      "number": "1",                    // string; soporta "14bis", "8bis", etc.
      "title": "Título del artículo",   // opcional
      "text": "Texto literal del artículo...",
      "incisos": [                      // lista de incisos (puede estar vacía)
        { "id": "a", "text": "Texto del inciso a..." }
      ],
      "location": {                     // estructura interna de la norma
        "libro": "Primero",
        "titulo": "I",
        "capitulo": "1",
        "seccion": "..."                // todos opcionales
      },
      "materia": ["contratos", "persona"],  // etiquetas para búsqueda
      "source": "URL específica del artículo (opcional)"
    }
  ]
}
```

---

## Uso

### Modo desarrollo (sin compilar)

```bash
npm run dev
```

### Modo producción

```bash
npm run build
npm start
```

### Variable de entorno alternativa para los datos

```bash
ARGLEG_DATA_DIR=/ruta/alternativa/a/los/json npm start
```

---

## Logging

El servidor escribe logs a **STDERR**. Nunca a STDOUT: ese canal está reservado
al transporte JSON-RPC de MCP; mezclar ambos rompería el protocolo.

### Niveles

| `ARGLEG_LOG_LEVEL` | Qué loguea |
|--------------------|-----------|
| `silent` | Nada |
| `info` *(default)* | Ciclo de vida (carga, ready, errores, normas faltantes) |
| `verbose` | `info` + cada llamada a tool/resource/prompt con duración y cantidad de hits |
| `debug` | `verbose` + argumentos recibidos y tamaño (bytes) de cada respuesta |

### Formato

Por defecto, texto human-readable:
```
[argleg-mcp 2026-04-23T22:25:11.341Z info   ] server.ready tools=4 resources=9 prompts=2 log_level=info
[argleg-mcp 2026-04-23T22:25:14.002Z verbose] tool.call name=get_article
[argleg-mcp 2026-04-23T22:25:14.004Z verbose] tool.done name=get_article ms=2
```

Con `ARGLEG_LOG_JSON=1` emite una línea JSON por evento (útil para aggregators):
```json
{"ts":"2026-04-23T22:25:14.002Z","level":"verbose","event":"tool.call","name":"get_article"}
```

### Ejemplos

```bash
# Ver cada llamada en tiempo real
ARGLEG_LOG_LEVEL=verbose npm start

# Debug completo con args y tamaños
ARGLEG_LOG_LEVEL=debug npm start

# Debug en formato JSON, pipeado a un archivo
ARGLEG_LOG_LEVEL=debug ARGLEG_LOG_JSON=1 npm start 2> argleg.log.jsonl

# Forzar además un archivo de log propio del servidor
ARGLEG_LOG_LEVEL=verbose ARGLEG_LOG_FILE=/tmp/argleg-mcp.log npm start
```

### Archivo de log opcional

Si tu cliente MCP no te muestra `stderr` claramente, podés pedirle al servidor que
además escriba a un archivo local:

```bash
ARGLEG_LOG_LEVEL=verbose ARGLEG_LOG_FILE=/tmp/argleg-mcp.log npm start
```

Variables:
- `ARGLEG_LOG_FILE=/ruta/al/archivo.log` → duplica cada línea de log en ese archivo.
- `ARGLEG_LOG_JSON=1` → si querés JSONL en ese mismo archivo.

Ejemplo:
```bash
ARGLEG_LOG_LEVEL=debug \
ARGLEG_LOG_JSON=1 \
ARGLEG_LOG_FILE=/tmp/argleg-mcp.jsonl \
node dist/index.js
```

### Dónde ver los logs cuando corre bajo un cliente MCP

- **Claude Desktop (macOS):** `~/Library/Logs/Claude/mcp-server-argleg.log`
- **Claude Desktop (Windows):** `%APPDATA%\Claude\logs\mcp-server-argleg.log`
- **Claude Code / Cursor:** consulta los logs MCP del propio cliente.
- **MCP Inspector:** panel "stderr" en la UI web.

---

## Tests

```bash
npm test
```

---

## Herramientas MCP expuestas

### `search_law`

Busca artículos por palabra clave, materia, capítulo o número.

```json
{
  "query": "persona humana",
  "law": "ccyc",
  "article": "19",
  "limit": 10
}
```

### `server_info`

Devuelve metadata operativa del servidor, incluyendo versión y fecha/hora de build.

```json
{}
```

### `get_article`

Devuelve el texto completo de un artículo específico.

```json
{
  "law": "constitucion",
  "article_number": "14bis"
}
```

### `compare_articles`

Presenta en paralelo dos artículos para comparación textual.

```json
{
  "law_a": "ccyc",
  "article_a": "1710",
  "law_b": "ley_24240",
  "article_b": "4"
}
```

---

## Recursos MCP

| URI | Descripción |
|-----|-------------|
| `law://constitucion` | Índice de la Constitución Nacional |
| `law://ccyc` | Índice del CCyC |
| `law://penal` | Índice del Código Penal |
| `law://cppf` | Índice del CPPF |
| `law://cpccn` | Índice del CPCCN |
| `law://ley_24240` | Índice de la Ley 24.240 |
| `law://{id}/article/{number}` | Artículo individual (template) |

---

## Prompts MCP

| Nombre | Descripción |
|--------|-------------|
| `analisis_juridico` | Análisis estructurado de un artículo |
| `comparacion_normativa` | Comparación entre dos artículos |

---

## Conectar desde un cliente MCP

Ver [`docs/connect.md`](docs/connect.md) para instrucciones detalladas.
