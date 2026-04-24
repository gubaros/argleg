import type { Article, Law, LawId } from "./types.js";
import type { SearchHit } from "./search.js";

function formatInciso(id: string, text: string): string {
  const clean = text.trim().replace(/\n{2,}/g, "\n");
  const lines = clean.split("\n");
  if (lines.length === 1) return `- **${id})** ${lines[0]}`;
  return [`- **${id})** ${lines[0]}`, ...lines.slice(1).map((line) => `  ${line}`)].join("\n");
}

export function formatArticle(lawId: LawId, law: Law, art: Article): string {
  const parts: string[] = [];
  parts.push(`# ${law.shortName} — Art. ${art.number}`);
  if (art.title) parts.push(`**${art.title}**`);
  const loc = formatLocation(art);
  if (loc) parts.push(`_${loc}_`);
  parts.push("");
  if (art.text.trim()) parts.push(art.text.trim());
  if (art.incisos.length > 0) {
    parts.push("");
    for (const inc of art.incisos) {
      parts.push(formatInciso(inc.id, inc.text));
    }
  }
  parts.push("");
  parts.push("---");
  parts.push(
    `**Identificación:** ley=\`${lawId}\` (${law.officialNumber ?? law.title}) · artículo \`${art.number}\``,
  );
  if (art.materia.length > 0) parts.push(`**Materia:** ${art.materia.join(", ")}`);
  parts.push(`**Fuente del artículo:** ${art.source ?? law.source}`);
  parts.push(`**Última actualización local:** ${law.lastUpdated}`);
  return parts.join("\n");
}

export function formatLocation(art: Article): string {
  const loc = art.location;
  const bits: string[] = [];
  if (loc.libro) bits.push(`Libro ${loc.libro}`);
  if (loc.parte) bits.push(`Parte ${loc.parte}`);
  if (loc.titulo) bits.push(`Título ${loc.titulo}`);
  if (loc.capitulo) bits.push(`Capítulo ${loc.capitulo}`);
  if (loc.seccion) bits.push(`Sección ${loc.seccion}`);
  return bits.join(" · ");
}

export function formatHit(hit: SearchHit): string {
  const loc = formatLocation(hit.article);
  const snippet = hit.article.text.trim().slice(0, 280);
  const more = hit.article.text.length > 280 ? "…" : "";
  return [
    `• **${hit.lawTitle}** — Art. ${hit.article.number}${hit.article.title ? ` (${hit.article.title})` : ""}`,
    loc ? `  _${loc}_` : undefined,
    `  ${snippet}${more}`,
    `  _match: ${hit.matchedOn.join(", ")} · score ${hit.score.toFixed(1)}_`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatLawSummary(law: Law): string {
  return [
    `# ${law.title}`,
    law.officialNumber ? `**${law.officialNumber}**` : undefined,
    law.description,
    "",
    `- Artículos cargados: **${law.articles.length}**`,
    `- Fuente: ${law.source}`,
    `- Última actualización local: ${law.lastUpdated}`,
    "",
    "## Índice de artículos",
    ...law.articles.map((a) => `- Art. ${a.number}${a.title ? ` — ${a.title}` : ""}`),
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}
