import type { Article, Law, LawId } from "./types.js";
import type { LoadedLibrary } from "./loader.js";
import { normalizeNumber } from "./loader.js";

export interface SearchHit {
  law: LawId;
  lawTitle: string;
  article: Article;
  score: number;
  matchedOn: Array<"number" | "title" | "text" | "materia" | "capitulo" | "titulo" | "inciso">;
}

export interface SearchOptions {
  query: string;
  law?: LawId;
  article?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Removes diacritics and lowercases for robust Spanish search. */
export function foldText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Splits a query into non-empty tokens, folded. */
export function tokenize(query: string): string[] {
  return foldText(query)
    .split(/[^a-z0-9áéíóúñü]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function searchArticles(lib: LoadedLibrary, opts: SearchOptions): SearchHit[] {
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const tokens = tokenize(opts.query);
  const articleFilter = opts.article ? normalizeNumber(opts.article) : undefined;

  const lawsToSearch: Array<[LawId, Law]> = opts.law
    ? lib.laws.has(opts.law)
      ? [[opts.law, lib.laws.get(opts.law)!]]
      : []
    : [...lib.laws.entries()];

  const hits: SearchHit[] = [];

  for (const [lawId, law] of lawsToSearch) {
    for (const art of law.articles) {
      if (articleFilter && normalizeNumber(art.number) !== articleFilter) continue;
      const scored = scoreArticle(art, tokens);
      if (scored.score > 0) {
        hits.push({
          law: lawId,
          lawTitle: law.title,
          article: art,
          score: scored.score,
          matchedOn: scored.matchedOn,
        });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

interface ArticleScore {
  score: number;
  matchedOn: SearchHit["matchedOn"];
}

function scoreArticle(art: Article, tokens: string[]): ArticleScore {
  if (tokens.length === 0) return { score: 0, matchedOn: [] };
  const matchedOn = new Set<SearchHit["matchedOn"][number]>();
  let score = 0;

  const numberFolded = foldText(art.number);
  const titleFolded = art.title ? foldText(art.title) : "";
  const textFolded = foldText(art.text);
  const materiaFolded = art.materia.map(foldText);
  const capFolded = art.location.capitulo ? foldText(art.location.capitulo) : "";
  const titSecFolded = art.location.titulo ? foldText(art.location.titulo) : "";
  const incisosFolded = art.incisos.map((i) => foldText(i.text));

  for (const t of tokens) {
    let tokenHit = false;
    if (numberFolded === t) {
      score += 50;
      matchedOn.add("number");
      tokenHit = true;
    }
    if (titleFolded.includes(t)) {
      score += 10;
      matchedOn.add("title");
      tokenHit = true;
    }
    if (materiaFolded.some((m) => m.includes(t))) {
      score += 6;
      matchedOn.add("materia");
      tokenHit = true;
    }
    if (capFolded.includes(t)) {
      score += 4;
      matchedOn.add("capitulo");
      tokenHit = true;
    }
    if (titSecFolded.includes(t)) {
      score += 4;
      matchedOn.add("titulo");
      tokenHit = true;
    }
    if (textFolded.includes(t)) {
      score += 3;
      matchedOn.add("text");
      tokenHit = true;
    }
    if (incisosFolded.some((i) => i.includes(t))) {
      score += 2;
      matchedOn.add("inciso");
      tokenHit = true;
    }
    if (!tokenHit) {
      // A token that matches nothing subtracts a small amount so all-tokens-match wins.
      score -= 0.5;
    }
  }

  if (score <= 0) return { score: 0, matchedOn: [] };
  return { score, matchedOn: [...matchedOn] };
}
