import type { Law, LawId } from "../laws/types.js";
import { parseLawHtml } from "./parsers/index.js";
import { htmlToText, parseArticles } from "./parsers/base.js";
import { parseGeneric } from "./parsers/generic.js";

export interface BuildLawOptions {
  id: LawId;
  title: string;
  shortName: string;
  officialNumber?: string;
  source: string;
  description?: string;
  lastUpdated?: string;
}

export function extractArticlesForLaw(id: LawId, html: string) {
  return parseLawHtml(id, html);
}

// Backward-compatible exports for existing tests/tools.
export function extractArticles(html: string) {
  return parseGeneric(html);
}

export function parseArticlesFromText(text: string) {
  return parseArticles(text);
}

export function buildLaw(opts: BuildLawOptions, articles: ReturnType<typeof parseLawHtml>): Law {
  return {
    id: opts.id,
    title: opts.title,
    shortName: opts.shortName,
    officialNumber: opts.officialNumber,
    source: opts.source,
    lastUpdated: opts.lastUpdated ?? new Date().toISOString().slice(0, 10),
    description: opts.description,
    articles,
  };
}
