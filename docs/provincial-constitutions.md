# Constituciones provinciales — alcance y workflow de ingesta

## Estado actual

argleg declara las **24 jurisdicciones constitucionales argentinas** (23 provincias + CABA) en su modelo de datos, vía [`PROVINCIAS`](../src/laws/hierarchy.ts) y [`TIER_BY_NORMA_ID`](../src/laws/hierarchy.ts).

A nivel runtime, el corpus actualmente solo trae texto ingestado para la **Constitución Nacional**. Las 24 constituciones provinciales / CABA están reservadas como `norma_id` con su tier asignado, pero **sin texto cargado todavía**. Cuando se hace ingesta de una constitución provincial, el flujo completo es uniforme — gracias al universal parser, no requiere un parser específico por provincia.

## Tier mapping

| Jurisdicción | `norma_id` | tier |
|---|---|---|
| Buenos Aires | `constitucion_buenos_aires` | `constitucion_provincial` |
| Catamarca | `constitucion_catamarca` | `constitucion_provincial` |
| Chaco | `constitucion_chaco` | `constitucion_provincial` |
| Chubut | `constitucion_chubut` | `constitucion_provincial` |
| Córdoba | `constitucion_cordoba` | `constitucion_provincial` |
| Corrientes | `constitucion_corrientes` | `constitucion_provincial` |
| Entre Ríos | `constitucion_entre_rios` | `constitucion_provincial` |
| Formosa | `constitucion_formosa` | `constitucion_provincial` |
| Jujuy | `constitucion_jujuy` | `constitucion_provincial` |
| La Pampa | `constitucion_la_pampa` | `constitucion_provincial` |
| La Rioja | `constitucion_la_rioja` | `constitucion_provincial` |
| Mendoza | `constitucion_mendoza` | `constitucion_provincial` |
| Misiones | `constitucion_misiones` | `constitucion_provincial` |
| Neuquén | `constitucion_neuquen` | `constitucion_provincial` |
| Río Negro | `constitucion_rio_negro` | `constitucion_provincial` |
| Salta | `constitucion_salta` | `constitucion_provincial` |
| San Juan | `constitucion_san_juan` | `constitucion_provincial` |
| San Luis | `constitucion_san_luis` | `constitucion_provincial` |
| Santa Cruz | `constitucion_santa_cruz` | `constitucion_provincial` |
| Santa Fe | `constitucion_santa_fe` | `constitucion_provincial` |
| Santiago del Estero | `constitucion_santiago_del_estero` | `constitucion_provincial` |
| Tierra del Fuego | `constitucion_tierra_del_fuego` | `constitucion_provincial` |
| Tucumán | `constitucion_tucuman` | `constitucion_provincial` |
| **CABA** | `constitucion_caba` | `constitucion_caba` (tier propio) |

CABA tiene un tier propio porque no es una provincia: es una ciudad autónoma con régimen especial bajo el art. 129 CN.

## Fuentes para fetch

A diferencia de las normas federales, las constituciones provinciales **no están en InfoLEG**. Cada provincia las publica en su propio portal oficial; el archivo HTML, el encoding y la estructura del DOM varían. Las URLs canónicas conocidas están registradas en `PROVINCIAS[].fuente_url` cuando se conoce; el resto requiere relevar el sitio oficial provincial. Punto de partida útil: [SAIJ — Sistema Argentino de Información Jurídica](http://www.saij.gob.ar/), que indexa normas provinciales aunque con calidad variable.

## Workflow de ingesta para una provincia

El plan ya fue trabajado a nivel modelo: el universal parser maneja los tiers `constitucion_provincial` y `constitucion_caba`. Para cargar el texto de una provincia:

1. **Identificar la URL oficial** del texto consolidado en el portal provincial (preferentemente sobre el portal de la legislatura o el boletín oficial).
2. **Descargar el HTML** localmente. Si la fuente no responde con HTTP estándar (algunos portales requieren cookies, sesión o token), descargar manualmente desde el navegador y guardar el HTML.
3. **Generar el JSON** con el universal parser. El comando `npm run fetch -- --id <norma_id>` ya invoca el universal parser por defecto cuando el `norma_id` pertenece a un tier soportado por él (todos los tiers actuales lo están).
4. **Importar a SQLite**: `npm run db:import` (o `db:reset` si se quiere repoblar todo).

## Particularidades por jurisdicción

- **Buenos Aires** — Constitución vigente: 1994. Estructura: Preámbulo, Sección Primera (Declaraciones, derechos y garantías), Sección Segunda (Poder Constituyente del Pueblo), etc.
- **Córdoba** — Reforma 2001. Una de las constituciones más extensas del país.
- **Santa Fe** — La más antigua aún vigente (1962). Estructura clásica.
- **CABA** — Sancionada en 1996 al adquirir la ciudad su autonomía. Estructura inusual: usa `Libro` como nivel superior (poco común en una constitución).
- **Tierra del Fuego** — Sancionada en 1991, recoge el régimen especial de la zona austral.

## Validación post-ingesta

Después de cargar una constitución provincial, validar:

```bash
sqlite3 data/argleg.db \
  "SELECT id, tier, titulo, estado_vigencia FROM normas WHERE id LIKE 'constitucion_%';"
```

Y verificar la estructura jerárquica:

```bash
sqlite3 data/argleg.db \
  "SELECT tipo, COUNT(*) FROM estructura_normativa
   WHERE norma_id = 'constitucion_buenos_aires' GROUP BY tipo;"
```

El universal parser debería devolver `parte | titulo | seccion | capitulo` según corresponda al texto provincial.
