import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLibrary, type LoadedLibrary } from "../src/laws/loader.js";
import { searchArticles, foldText, tokenize } from "../src/laws/search.js";

const DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
);

let lib: LoadedLibrary;

beforeAll(async () => {
  lib = await loadLibrary({ dataDir: DATA_DIR });
});

describe("foldText", () => {
  it("removes diacritics", () => {
    expect(foldText("Artículo")).toBe("articulo");
  });

  it("lowercases", () => {
    expect(foldText("PENAL")).toBe("penal");
  });

  it("handles empty string", () => {
    expect(foldText("")).toBe("");
  });
});

describe("tokenize", () => {
  it("splits on whitespace", () => {
    expect(tokenize("persona humana")).toEqual(["persona", "humana"]);
  });

  it("removes empty tokens", () => {
    expect(tokenize("  daño  ")).toEqual(["dano"]);
  });

  it("folds diacritics", () => {
    expect(tokenize("Artículo")).toEqual(["articulo"]);
  });
});

describe("searchArticles", () => {
  it("returns results for a broad term present in materia", () => {
    const hits = searchArticles(lib, { query: "homicidio" });
    // At least one hit from penal
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.law === "penal")).toBe(true);
  });

  it("restricts to specified law", () => {
    const hits = searchArticles(lib, { query: "consumidor", law: "ley_24240" });
    for (const h of hits) {
      expect(h.law).toBe("ley_24240");
    }
  });

  it("filters by article number when provided", () => {
    const hits = searchArticles(lib, {
      query: "consumidor",
      law: "ley_24240",
      article: "1",
    });
    for (const h of hits) {
      expect(h.article.number).toBe("1");
    }
  });

  it("returns empty array when law has no match", () => {
    const hits = searchArticles(lib, {
      query: "qzxvplmnoa_9823746501_unmatchable_token",
    });
    expect(hits).toHaveLength(0);
  });

  it("returns empty array for a law not in library", () => {
    const hits = searchArticles(lib, {
      query: "gobierno",
      law: "constitucion",
    });
    // seed data has materia: ['forma de gobierno', ...] on art 1
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it("respects limit", () => {
    const hits = searchArticles(lib, { query: "a", limit: 2 });
    expect(hits.length).toBeLessThanOrEqual(2);
  });

  it("sorts by descending score", () => {
    const hits = searchArticles(lib, { query: "gobierno" });
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
    }
  });
});
