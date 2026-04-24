# Conectar argleg-mcp desde clientes MCP

## Claude Desktop (macOS / Windows)

Editá `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
o `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Reemplazá `TU_USUARIO` con tu nombre de usuario macOS.

Compilá primero:
```bash
cd ~/Desktop/mcp && npm run build
```

Reiniciá Claude Desktop. El servidor `argleg` aparecerá en la lista de herramientas.

---

## Claude Code (CLI)

Agregá el servidor al archivo de configuración del proyecto (`.claude/settings.json`
o `~/.claude/settings.json`):

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

O usando `tsx` para desarrollo (sin build previo):

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

## Cursor / VS Code (extensión MCP)

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

## Prueba rápida desde CLI (inspección manual)

Instalá el inspector oficial de MCP:

```bash
npx @modelcontextprotocol/inspector node /Users/TU_USUARIO/Desktop/mcp/dist/index.js
```

Esto abre una UI en `http://localhost:5173` donde podés ejecutar herramientas,
leer recursos y llamar prompts de forma interactiva.

---

## Ejemplos de uso en un chat

Una vez conectado, podés pedir:

```
Usá get_article con law=constitucion y article_number=14bis
```

```
Buscá artículos sobre "daño" en el CCyC usando search_law
```

```
Comparé el artículo 79 del Código Penal con el artículo 4 de la Ley 24.240
```

```
Aplicá el prompt analisis_juridico al artículo 1710 del CCyC
```

---

## Seguridad

- El servidor es **solo lectura**. No escribe ni modifica archivos.
- No ejecuta comandos del sistema.
- Todos los parámetros se validan con Zod antes de procesarse.
- La fuente de datos es exclusivamente el directorio local configurado.
