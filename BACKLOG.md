# BACKLOG.md

Backlog operativo del proyecto `argleg-mcp`.

Este backlog está pensado para trabajo técnico real, no para wishlist vaga.
Cada ítem incluye:
- contexto
- alcance
- riesgos
- entregables
- **Definition of Ready (DoR)**
- **Definition of Done (DoD)**

---

# Principios de trabajo

## Fuente de verdad
- Toda norma servida por el MCP debe salir **exclusivamente** de archivos locales en `data/`.
- Ningún parser puede completar texto legal faltante con conocimiento externo.
- Si el corpus local no contiene una norma o artículo, la respuesta correcta es: `norma no disponible en la base local`.

## Criterio de calidad mínimo para un corpus
Un corpus no se considera “confiable” sólo porque parsea “algo”.
Debe cumplir, como mínimo:
- numeración consistente
- extremos esperados razonables (inicio y final)
- ausencia de placeholders
- ausencia de artículos vacíos
- ausencia de TOC/rangos parseados como artículos
- ausencia de contaminación evidente por anexos ajenos
- tests de artículos sentinel

## Regla de parsers
Cada ley/corpus tiene su propio parser en `src/scripts/parsers/`.
Se permite reutilizar helpers comunes, pero no volver a una heurística única para todos los corpus.

---

# Definition of Ready (global)

Un ítem del backlog está **Ready** sólo si cumple todo esto:

1. **Problema definido**
   - Se entiende qué está roto o qué falta.
   - Hay ejemplos concretos, no sólo impresiones.
   - Se sabe qué corpus afecta.

2. **Entrada identificada**
   - Se conoce la fuente HTML/archivo local con la que se va a trabajar.
   - Está identificada la ruta o URL de referencia.
   - Si el trabajo requiere fixture, está disponible o se sabe de dónde sacarlo.

3. **Criterio de validación explícito**
   - Hay artículos sentinel o casos de prueba concretos.
   - Hay una forma objetiva de decidir si mejoró o no.

4. **Impacto acotado**
   - Está claro qué archivos se espera tocar.
   - Está claro si el cambio afecta sólo importación, o también tests/docs/data.

5. **Riesgos conocidos**
   - Se identificaron riesgos de regresión, encoding, numeración o contaminación de TOC/anexos.

6. **Sin bloqueo externo oculto**
   - No depende de una credencial faltante, aprobación inexistente o archivo inaccesible.
   - Si depende de un input externo, eso está explícitamente marcado.

Si no se cumplen estos puntos, el ítem **no está Ready**.

---

# Definition of Done (global)

Un ítem está **Done** sólo si cumple todos estos puntos, sin excepción:

1. **Cambio implementado**
   - El código necesario está hecho.
   - No quedó sólo documentado o “planeado”.

2. **Validación técnica ejecutada**
   - `npm run build` pasa.
   - `npm test` pasa.
   - Si aplica, se regeneró el corpus afectado y se inspeccionó el resultado.

3. **Validación funcional explícita**
   - Se probaron artículos sentinel representativos.
   - Se comprobó inicio, mitad y final del corpus cuando corresponda.
   - Se comprobó que no aparezcan TOC, rangos, ley aprobatoria o anexo incorrecto mezclado.

4. **Sin regresiones evidentes**
   - No se rompieron otros parsers o el dispatcher.
   - No se degradó un corpus previamente sano.

5. **Artefactos actualizados**
   - Tests actualizados o agregados.
   - README/BACKLOG/docs actualizados si el cambio altera comportamiento o estado real.
   - `data/*.json` actualizado si el ítem requería regeneración.

6. **Estado honestamente reflejado**
   - Si algo quedó pendiente, el ítem no se marca Done.
   - Si un parser quedó “parcial”, debe figurar como parcial, no como terminado.

7. **Trazabilidad mínima**
   - El cambio quedó committeado o al menos en estado verificable localmente.

Si falta cualquiera de estos puntos, el ítem **no está Done**.

---

# P0 — Bloqueantes funcionales

## BL-001 — Cerrar parser específico del CPPF

### Contexto
El corpus `cppf.json` mostró síntomas claros de corrupción: entradas provenientes de tabla de contenidos/rangos (`art. 1 a 24`, `25 a 29`, etc.) interpretadas como artículos reales. El HTML de InfoLEG sí contiene el texto correcto; el problema es de parsing.

### Objetivo
Dejar `cppf.json` regenerable y confiable usando su parser específico.

### Alcance
- `src/scripts/parsers/cppf.ts`
- tests del parser CPPF
- regeneración de `data/cppf.json`
- validación manual/automática del corpus resultante

### Riesgos
- capturar TOC como artículos
- cortar demasiado pronto o demasiado tarde
- contaminar el corpus con `ANEXO II`
- perder artículos con formatos raros (`bis`, grados, guiones, headings intermedios)

### Entregables
- parser específico de CPPF sólido
- `cppf.json` regenerado
- tests de parser y artículos sentinel
- documentación del estado real del corpus

### Definition of Ready (específica)
- existe evidencia reproducible del problema actual
- existe HTML fuente identificado para CPPF
- están definidos artículos sentinel de validación
- está claro dónde empieza el cuerpo normativo y dónde debe cortar
- se identificó al menos un caso de TOC mal parseado y un caso de artículo real bien parseado esperado

### Definition of Done (específica)
- `cppf.json` se regenera desde el parser específico
- el corpus NO contiene entradas tipo rango/índice como artículos
- `get_article(cppf, 1)` devuelve un artículo sustantivo real
- `get_article(cppf, 2)` devuelve un artículo sustantivo real
- `get_article(cppf, 24)` devuelve un artículo sustantivo real
- `get_article(cppf, 25)` devuelve un artículo sustantivo real
- `get_article(cppf, 202)` devuelve un artículo sustantivo real, no un heading
- `get_article(cppf, 349)` devuelve un artículo sustantivo real si existe en la fuente local
- el parser corta correctamente antes de `ANEXO II`
- `npm run build` y `npm test` pasan
- existe al menos un test sintético y uno basado en corpus regenerado

---

## BL-002 — Crear parser específico real para CPCCN

### Contexto
`cpccn.json` no tiene placeholders ni artículos vacíos, pero arrastra headings y muestra artículos sospechosamente truncados.

### Objetivo
Reducir de forma visible y verificable el ruido estructural del corpus CPCCN.

### Alcance
- `src/scripts/parsers/cpccn.ts`
- tests específicos
- regeneración de `data/cpccn.json`

### Riesgos
- mezclar títulos/capítulos con artículos
- truncar artículos reales por cortes demasiado agresivos
- empeorar artículos válidos por limpiar “de más”

### Entregables
- parser específico real para CPCCN
- corpus regenerado
- reporte comparativo antes/después

### Definition of Ready (específica)
- artículos sospechosos identificados (mínimo: 134, 362, 391, 483, 486)
- HTML fuente identificado
- criterio claro de “mejora” definido
- muestras del ruido estructural actual capturadas

### Definition of Done (específica)
- parser específico implementado en `cpccn.ts`
- `cpccn.json` regenerado con ese parser
- los artículos sentinel 134, 362, 391, 483 y 486 fueron inspeccionados
- ninguno de esos artículos queda obviamente truncado por el mismo problema previo
- disminuye el conteo de artículos con headings incrustados o se documenta por qué no puede bajar más
- `npm run build` y `npm test` pasan
- tests específicos agregados

---

# P1 — Calidad alta por corpus

## QL-001 — Parser específico real para Penal ✅ DONE

### Contexto
El corpus Penal está razonablemente usable, pero aún mezcla algunos headings y requiere manejo fino de artículos `bis/ter/quater/quinquies` y artículos derogados.

### Estado actual
Resuelto con parser específico en `src/scripts/parsers/penal.ts`, extracción conservadora de incisos y log único auditable en `parser_logs/penal-incisos.log`.

### Validación ejecutada
- `data/penal.json` regenerado
- tests agregados para parser y loader
- artículos validados: `1`, `59`, `72`, `81`, `149ter`, `308`
- `npm run build` y `npm test` en verde

### Definition of Done (específica)
- `penal.ts` implementa lógica propia, no simple pass-through genérico ✅
- se validan artículos base + especiales (`bis/quinquies`) ✅
- los artículos derogados breves no se marcan erróneamente como fallo ✅
- baja o se controla el ruido de headings ✅
- tests nuevos agregados ✅
- corpus regenerado ✅

## QL-002 — Parser específico real para CCyC ✅ DONE

### Estado actual
Resuelto con parser específico en `src/scripts/parsers/ccyc.ts`, extracción conservadora de incisos por artículo y log único auditable en `parser_logs/ccyc-incisos.log`.

### Validación ejecutada
- `data/ccyc.json` regenerado
- cobertura real de incisos en cientos de artículos
- validación de artículos sentinel (`14`, `24`, `37`, `58`, `59`, `103`, `195`, `706`, `930`, `988`, etc.)
- `npm run build` y `npm test` en verde

## QL-003 — Parser específico real para CPPF ✅ DONE

### Estado actual
Resuelto con parser específico en `src/scripts/parsers/cppf.ts`, extracción conservadora de incisos y log único auditable en `parser_logs/cppf-incisos.log`.

### Validación ejecutada
- `data/cppf.json` regenerado
- artículos validados: `30`, `37`, `52`, `79`, `90`
- `npm run build` y `npm test` en verde

## QL-004 — Incorporar Ley 19.549 ✅ DONE

### Estado actual
- alta en `LawIdSchema`, `LAW_IDS` y `LAW_FILE_BY_ID`
- corpus generado en `data/ley_19549.json`
- parser específico en `src/scripts/parsers/ley_19549.ts`
- log único auditable en `parser_logs/ley_19549-incisos.log`

### Validación ejecutada
- artículos detectados: 33
- validaciones manuales sobre `1`, `1bis`, `7`, `9`, `10`, `14`, `19`, `25`
- `npm run build` y `npm test` en verde

## QL-005 — Incorporar Ley 19.550 ✅ DONE

### Estado actual
- alta en `LawIdSchema`, `LAW_IDS` y `LAW_FILE_BY_ID`
- corpus generado en `data/ley_19550.json`
- parser específico en `src/scripts/parsers/ley_19550.ts`
- log único auditable en `parser_logs/ley_19550-incisos.log`

### Validación ejecutada
- artículos detectados: 358
- validaciones manuales sobre `10`, `11`, `13`, `24`, `33`, `63`, `64`, `77`, `88`, `281`, `339`
- `npm run build` y `npm test` en verde

---

## QL-002 — Parser específico real para Constitución

### Contexto
La Constitución está relativamente sana, pero aún presenta algunos headings incrustados.

### Definition of Ready (específica)
- artículos sospechosos listados
- HTML fuente identificado
- se definió si la estructura constitucional requiere lógica especial o sólo limpieza controlada

### Definition of Done (específica)
- `constitucion.ts` contiene lógica explícita del corpus
- artículos 1, 60, 74, 115 y 129 revisados
- headings espurios reducidos o documentados
- tests agregados

---

## QL-003 — Parser específico real para Ley 24.240

### Contexto
La LDC está bastante sana, pero aún tiene headings incrustados y merece parser propio real para evitar regresiones.

### Definition of Ready (específica)
- HTML fuente identificado
- lista de artículos sentinel definida
- ejemplos del ruido actual capturados

### Definition of Done (específica)
- `ley_24240.ts` contiene lógica específica
- el corpus regenerado mantiene cobertura completa esperable
- baja el ruido estructural
- tests nuevos agregados

---

# P2 — Enriquecimiento estructural

## EN-001 — Extraer `location` por corpus

### Objetivo
Poblar `libro`, `parte`, `titulo`, `capitulo`, `seccion` cuando el corpus lo permita.

### Definition of Ready (específica)
- corpus objetivo elegido
- estructura jerárquica de la norma entendida
- se sabe qué headings mapear a qué campos

### Definition of Done (específica)
- parser del corpus rellena `location` de forma consistente
- tests verifican al menos tres artículos en ubicaciones distintas
- la búsqueda/formatting no se rompe

---

## EN-002 — Extraer incisos estructurados

### Objetivo
Pasar de texto corrido a `incisos[]` cuando la fuente lo permita sin mutilar contenido.

### Definition of Ready (específica)
- corpus y patrón de incisos identificados
- se sabe diferenciar inciso real de enumeración interna casual

### Definition of Done (específica)
- al menos un corpus exporta incisos estructurados correctamente
- tests verifican ids y texto de incisos
- `formatArticle` los renderiza bien

---

## EN-003 — Enriquecer `materia`

### Objetivo
Agregar etiquetas mínimas útiles por corpus para mejorar `search_law`.

### Definition of Ready (específica)
- estrategia de tagging definida (manual, semiautomática o por mapeo)
- se decidió el alcance para evitar pseudo-semantización inventada

### Definition of Done (específica)
- al menos un corpus tiene `materia` útil y consistente
- `search_law` mejora con consultas temáticas reales
- tests agregados

---

# P3 — Confiabilidad y tooling

## TO-001 — Auditor automático de corpus

### Objetivo
Agregar un comando que detecte problemas comunes de integridad y parseo.

### Alcance sugerido
`npm run audit:data`

### Chequeos mínimos
- placeholders
- artículos vacíos
- duplicados
- numeración sospechosa
- headings incrustados
- rangos TOC parseados como artículos
- ley aprobatoria mezclada con anexo sustantivo
- cortes prematuros de corpus

### Definition of Ready (específica)
- se definió salida esperada del comando
- se definieron thresholds o reglas de warning/error

### Definition of Done (específica)
- existe comando ejecutable en `package.json`
- produce reporte legible
- falla con exit code no-cero cuando hay corrupción grave configurable
- cubre al menos los corpus actuales

---

## TO-002 — Fixtures reales por corpus

### Objetivo
Guardar fixtures HTML minimizados o controlados para tests reproducibles por parser.

### Definition of Ready (específica)
- se definió política de tamaño y sanitización de fixtures
- hay una ubicación clara para almacenarlos

### Definition of Done (específica)
- cada parser tiene al menos un fixture relevante
- los tests no dependen sólo de la red o del HTML vivo

---

## TO-003 — Mejorar `fetch-infoleg`

### Objetivo
Hacer más robusta la importación desde red o archivo.

### Pendientes concretos
- resolver bien 403 intermitentes
- uniformar lectura `utf8/latin1`
- loguear parser elegido
- opcional: `--save-html`

### Definition of Ready (específica)
- reproducido el comportamiento actual problemático
- definido output/log esperado

### Definition of Done (específica)
- `--url` y `--file` usan decodificación robusta
- se informa qué parser se usó
- errores de red quedan claros y accionables
- tests cubren fallback de encoding al menos parcialmente

---

# P4 — Producto MCP

## PR-001 — Navegación estructural

### Objetivo
Agregar herramientas para navegar leyes sin conocer artículo exacto.

### Candidatas
- `list_articles(law, chapter?)`
- `list_titles(law)`
- `list_chapters(law, title?)`

### Definition of Ready (específica)
- al menos un corpus tiene estructura suficiente (`location`) para aprovecharlas
- formato de respuesta decidido

### Definition of Done (específica)
- herramienta(s) implementada(s)
- tests agregados
- documentadas en README

---

## PR-002 — Recursos MCP más granulares

### Objetivo
Exponer recursos por segmentos de norma, no sólo ley completa o artículo.

### Definition of Ready (específica)
- estructura `location` disponible en al menos un corpus
- URIs objetivo definidas

### Definition of Done (específica)
- recursos nuevos implementados
- validados con un cliente MCP o prueba manual equivalente

---

# Orden recomendado

1. BL-001 — CPPF
2. BL-002 — CPCCN
3. QL-001 — Penal
4. QL-002 — Constitución
5. QL-003 — Ley 24.240
6. EN-001 — `location`
7. EN-002 — incisos
8. TO-001 — auditor automático
9. TO-002 — fixtures reales por corpus
10. TO-003 — robustez de fetch
11. PR-001 / PR-002 — mejoras de producto MCP

---

# Estado actual resumido

- Arquitectura por corpus: **implementada**
- Parsers específicos reales: **CCyC, CPPF**
- Parsers dedicados por archivo con estrategia base: **Constitución, Penal, CPCCN, Ley 24.240**
- MCP server: **funcional**
- Corpus CCyC: **regenerado y validado**
- Resto de corpus: **requieren hardening progresivo**
