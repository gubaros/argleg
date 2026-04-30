# Arg Leg MCP

[![Node.js CI](https://github.com/gubaros/argleg/actions/workflows/node.js.yml/badge.svg)](https://github.com/gubaros/argleg/actions/workflows/node.js.yml)
[![License: Proprietary](https://img.shields.io/badge/Licencia-Propietaria-red.svg)](LICENSE)

Servidor MCP de solo lectura para consultar legislación argentina desde archivos locales.

Desarrollado por **Guido Barosio** en el marco del **IA Lab** de [Palermo E-Law — Centro de Estudios de Derecho Digital UP](https://www.palermo.edu/derecho/palermo-e-law/), Universidad de Palermo.

> **Aviso legal:** Este servidor es una herramienta orientativa. El contenido normativo proviene exclusivamente de archivos locales. No sustituye el asesoramiento profesional de un abogado matriculado. Verificá siempre el texto vigente en fuentes oficiales (InfoLEG, BORA).

---

## Documentación

| Idioma | Enlace |
|--------|--------|
| Español | [docs/guia.md](docs/guia.md) |
| English | [docs/guide.md](docs/guide.md) |

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

## Herramientas MCP

| Herramienta | Descripción |
|-------------|-------------|
| `search_law` | Busca artículos por palabra clave, materia o número |
| `get_article` | Devuelve el texto completo de un artículo |
| `compare_articles` | Compara dos artículos en paralelo |
| `server_info` | Metadata operativa del servidor |

## Recursos MCP

| URI | Descripción |
|-----|-------------|
| `law://<id>` | Índice de cada norma cargada |
| `law://{id}/article/{number}` | Artículo individual (template) |

## Prompts MCP

| Nombre | Descripción |
|--------|-------------|
| `analisis_juridico` | Análisis estructurado de un artículo |
| `comparacion_normativa` | Comparación entre dos artículos |

---

## Sobre Palermo E-Law

[Palermo E-Law](https://www.palermo.edu/derecho/palermo-e-law/) es el Centro de Estudios de Derecho Digital de la Facultad de Derecho de la Universidad de Palermo. Promueve el estudio y la discusión sobre las implicancias de la tecnología en el campo jurídico, ofreciendo un espacio de formación, debate, cooperación interinstitucional e implementación de proyectos de investigación.

Este proyecto forma parte de las iniciativas del **IA Lab** de Palermo E-Law, orientadas a explorar el uso de inteligencia artificial como herramienta de apoyo a la práctica y la investigación jurídica.

---

## Copyright

Copyright © 2026 Guido Barosio. Todos los derechos reservados.
Uso prohibido sin autorización expresa del autor.
