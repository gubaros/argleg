# Arg Leg MCP

[![Node.js CI](https://github.com/gubaros/argleg/actions/workflows/node.js.yml/badge.svg)](https://github.com/gubaros/argleg/actions/workflows/node.js.yml)
[![Licencia](https://img.shields.io/badge/Licencia-No_Comercial_·_Con_Restricciones-blue.svg)](LICENSE)

Servidor MCP de solo lectura para consultar legislación argentina. La fuente de verdad operativa es una base **SQLite local** (`data/argleg.db`); los archivos JSON en `data/` son input/fixtures de la ingesta.

Desarrollado por **Guido Barosio** en el marco del **IA Lab** de [Palermo E-Law — Centro de Estudios de Derecho Digital UP](https://www.palermo.edu/derecho/palermo-e-law/), Universidad de Palermo.

> **Aviso legal:** Este servidor es una herramienta orientativa. El contenido proviene exclusivamente de la base local de argleg. No sustituye el asesoramiento profesional de un abogado matriculado. Verificá siempre el texto vigente en fuentes oficiales (InfoLEG, BORA).

---

## Quick start

```bash
git clone https://github.com/gubaros/argleg.git
cd argleg
npm install
npm run db:init        # crea data/argleg.db con el schema
npm run db:import      # ingesta los JSON del corpus a SQLite
npm run build          # compila a dist/
```

Para conectar el servidor a Claude Desktop, Claude Code, Cursor o un MCP Inspector, seguir la guía completa según el idioma:

| Idioma | Documentación |
|--------|---------------|
| Español | [docs/guia.md](docs/guia.md) |
| English | [docs/guide.md](docs/guide.md) |

Reglas de arquitectura del proyecto y *best practices* para contribuir: [CLAUDE.md](CLAUDE.md).

---

## Cobertura del corpus

### Pirámide normativa

argleg modela la jerarquía constitucional argentina (art. 31 CN + práctica constitucional vigente) en **15 *tiers***, desde la cúspide federal hasta lo municipal. Cada tier tiene un perfil con su rango kelseniano, ámbito territorial, órgano emisor habilitado, base constitucional cuando aplica, y los niveles estructurales (parte / libro / título / capítulo / sección) que un documento de ese tier puede contener. Definición completa: [src/laws/hierarchy.ts](src/laws/hierarchy.ts).

| # | Tier | Ámbito | Ejemplos |
|---|------|--------|----------|
| 1 | `constitucion_nacional` · `tratado_constitucional` | federal | CN; tratados de DDHH del art. 75.22 |
| 2 | `tratado_internacional` | federal | tratados con jerarquía supralegal |
| 3 | `codigo_fondo` · `codigo_procesal_federal` · `ley_federal` | federal | CCyC, Penal, CPCCN, CPPF, leyes federales |
| 4 | `dnu` · `decreto_delegado` | federal | art. 99.3 / art. 76 CN |
| 5 | `decreto_pen` | federal | reglamentarios y autónomos |
| 6 | `resolucion_ministerial` · `disposicion_organismo` | federal | actos administrativos |
| 7 | `constitucion_provincial` · `constitucion_caba` | provincial | 23 provincias + CABA |
| 8-9 | `ley_provincial` · `decreto_provincial` | provincial | |
| 10 | `ordenanza_municipal` | municipal | |

### Normas federales con texto cargado

| ID | Nombre | Número oficial | Estado |
|----|--------|----------------|--------|
| `constitucion` | Constitución de la Nación Argentina | Texto 1994 | vigente |
| `ccyc` | Código Civil y Comercial | Ley 26.994 | vigente |
| `penal` | Código Penal | Ley 11.179 | vigente |
| `cppf` | Código Procesal Penal Federal | Ley 27.063 | vigente |
| `cpccn` | Código Procesal Civil y Comercial de la Nación | Ley 17.454 | vigente |
| `ley_24240` | Ley de Defensa del Consumidor | Ley 24.240 | vigente |
| `ley_19550` | Ley General de Sociedades | Ley 19.550 | vigente |
| `ley_19549` | Ley Nacional de Procedimientos Administrativos | Ley 19.549 | vigente |
| `ley_25326` | Ley de Protección de los Datos Personales | Ley 25.326 | vigente |

### Constituciones provinciales y CABA

Las **24 jurisdicciones constitucionales argentinas** (23 provincias + CABA) están declaradas en el modelo de datos. La ingesta del texto de cada una es incremental — workflow y fuentes oficiales en [docs/provincial-constitutions.md](docs/provincial-constitutions.md). Cada provincia se identifica con `constitucion_<provincia>` (snake_case): `constitucion_buenos_aires`, `constitucion_cordoba`, `constitucion_santa_fe`, etc. CABA usa un tier propio (`constitucion_caba`) por su régimen del art. 129 CN.

---

## Capa de inteligencia jurídica

Más allá del texto normativo, argleg expone una capa de conocimiento jurídico curado:

- **8 ramas del derecho**: constitucional, civil, comercial, penal, procesal, administrativo, del consumidor, de protección de datos personales.
- **17 principios fundamentales**: supremacía constitucional, división de poderes, jerarquía constitucional de tratados de DDHH, buena fe, abuso del derecho, *pacta sunt servanda*, principio de legalidad penal, in dubio pro reo, *ne bis in idem*, legalidad administrativa, motivación de actos, razonabilidad, in dubio pro consumidor, habeas data, calidad de datos personales, etc. — cada uno con su fuente normativa o dogmática y vigencia.
- **Vínculos norma ↔ rama** con relevancia (nuclear / complementaria / tangencial). Por ejemplo, el CCyC es nuclear en derecho civil y comercial, complementaria en consumidor.
- **Doctrina de referencia**: Bidart Campos, Sagüés (constitucional); Borda, Lorenzetti (civil); Zaffaroni, Soler (penal); Cassagne, Gordillo (administrativo); Palacio (procesal); Stiglitz (consumidor).
- **Jurisprudencia**: schema listo, curación incremental (CSJN, CIDH, etc.).

Acceso vía las tools `list_ramas` y `get_rama_metadata`.

---

## Herramientas MCP

| Herramienta | Descripción |
|-------------|-------------|
| `list_norms` | Lista las normas disponibles (filtros por **tier**, materia o vigencia) |
| `get_norm_metadata` | Devuelve metadata completa de una norma + resumen estructural |
| `get_article` | Devuelve el texto completo de un artículo con su contexto estructural |
| `search_articles` | Busca artículos por palabra clave o número (filtra por norma) |
| `compare_articles` | Compara dos artículos en paralelo |
| `list_sections` | Devuelve el árbol estructural completo de una norma |
| `get_section` | Devuelve una sección estructural + todos los artículos contenidos en una sola llamada |
| `list_ramas` | Lista las ramas del derecho cubiertas |
| `get_rama_metadata` | Devuelve principios, normas aplicables, doctrina y jurisprudencia de una rama |
| `server_info` | Metadata operativa del servidor |

### Recursos MCP

| URI | Descripción |
|-----|-------------|
| `law://<id>` | Índice de cada norma cargada |
| `law://{id}/article/{number}` | Artículo individual (template) |

### Prompts MCP

| Nombre | Descripción |
|--------|-------------|
| `analisis_juridico` | Análisis estructurado de un artículo |
| `comparacion_normativa` | Comparación entre dos artículos |

---

## Cómo agregar una norma al corpus

El corpus legislativo crece con la participación de la comunidad. Hay dos caminos:

**Solicitar una norma vía issue.** Si necesitás una norma que todavía no está cargada, [abrí un issue](https://github.com/gubaros/argleg/issues/new) describiendo qué ley querés y, si podés, pegá la URL de InfoLEG correspondiente. Cada issue queda disponible como tarea abierta que cualquier persona con conocimiento básico de desarrollo y GitHub puede tomar y resolver de forma voluntaria.

**Agregarla vos mismo.** Al ser software de código abierto, cualquiera puede incorporar una norma y proponer un pull request:

Tres gatekeepers que tocás antes del primer fetch (los tres son obligatorios; saltearse uno produce un error en algún punto del pipeline):

1. **Hierarchy** — agregá el `norma_id` con su tier al mapping `TIER_BY_NORMA_ID` de [src/laws/hierarchy.ts](src/laws/hierarchy.ts). Sin esta declaración el `db-import` falla.
2. **Validación legacy del JSON** — agregá el id a `LawIdSchema`, `LAW_IDS` y `LAW_FILE_BY_ID` en [src/laws/types.ts](src/laws/types.ts). Sin esto el `loadLibrary()` no carga el JSON al ingest.
3. **Parser de fetch** — creá `src/scripts/parsers/<id>.ts`, registrálo en el switch `parseLawHtml` de `parsers/index.ts`, y agregá título por defecto en `DEFAULT_TITLES` de `src/scripts/fetch-infoleg.ts`. Sin esto `npm run fetch` no sabe cómo extraer artículos del HTML de InfoLEG.

Después:

4. **Encontrá la URL del texto consolidado** en InfoLEG (federal) o el portal oficial provincial.
5. **Ejecutá el importador**: `npm run fetch -- --id <norma_id> --url '<URL>' --force` genera el JSON en `data/`.
6. **Cargá a SQLite**: `npm run db:reset` recrea la base con todos los JSON, incluido el nuevo.
7. **Opcional pero recomendado**: agregá entrada en `VIGENCIA_BY_NORMA_ID` (`db-import.ts`) si la norma está vigente.
8. **Verificá y abrí un pull request**.

> El universal parser de [src/laws/universal-parser.ts](src/laws/universal-parser.ts) es el reemplazo eventual del paso 3 (parser per-law), pero todavía no está wireado a `fetch-infoleg`. Hasta que lo esté, los tres gatekeepers son requeridos.

Para constituciones provinciales el workflow es el mismo, sólo cambia la fuente del HTML (cada provincia tiene su portal). Detalle en [docs/provincial-constitutions.md](docs/provincial-constitutions.md).

> Estos pasos pueden hacerse con asistencia de IA. Herramientas como **Claude Code** o **Claude Codex** pueden guiarte o ejecutarlos directamente si les das acceso al repositorio. El archivo [CLAUDE.md](CLAUDE.md) tiene las instrucciones que el agente sigue.

---

## Sobre Palermo E-Law

[Palermo E-Law](https://www.palermo.edu/derecho/palermo-e-law/) es el Centro de Estudios de Derecho Digital de la Facultad de Derecho de la Universidad de Palermo. Promueve el estudio y la discusión sobre las implicancias de la tecnología en el campo jurídico, ofreciendo un espacio de formación, debate, cooperación interinstitucional e implementación de proyectos de investigación.

Este proyecto forma parte de las iniciativas del **IA Lab** de Palermo E-Law, orientadas a explorar el uso de inteligencia artificial como herramienta de apoyo a la práctica y la investigación jurídica. Palermo E-Law está liderado por los abogados Anibal Ramirez y Hernán Quadri.

---

## Licencia y copyright

Copyright © 2026 Guido Barosio.

Código de fuente abierta. Queda prohibido el **uso comercial** y la **integración en otros sistemas** sin autorización expresa del autor. Toda modificación debe canalizarse mediante pull request en el repositorio oficial. Ver [LICENSE](LICENSE) para el texto completo.

Consultas: gbarosio@gmail.com
