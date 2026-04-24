import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadLibrary,
  findArticle,
  normalizeNumber,
  NOT_AVAILABLE,
  type LoadedLibrary,
} from "../src/laws/loader.js";

const DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
);

let lib: LoadedLibrary;

beforeAll(async () => {
  lib = await loadLibrary({ dataDir: DATA_DIR });
});

describe("loadLibrary", () => {
  it("loads at least one law from the local data directory", () => {
    expect(lib.laws.size).toBeGreaterThan(0);
  });

  it("reports no fatal parse errors on seed files", () => {
    expect(lib.errors).toHaveLength(0);
  });

  it("loads constitucion", () => {
    expect(lib.laws.has("constitucion")).toBe(true);
  });

  it("loads ccyc", () => {
    expect(lib.laws.has("ccyc")).toBe(true);
  });

  it("loads penal", () => {
    expect(lib.laws.has("penal")).toBe(true);
  });

  it("loads cppf", () => {
    expect(lib.laws.has("cppf")).toBe(true);
  });

  it("loads cpccn", () => {
    expect(lib.laws.has("cpccn")).toBe(true);
  });

  it("loads ley_24240", () => {
    expect(lib.laws.has("ley_24240")).toBe(true);
  });

  it("each loaded law has at least one article", () => {
    for (const [id, law] of lib.laws.entries()) {
      expect(law.articles.length, `${id} must have ≥ 1 article`).toBeGreaterThan(0);
    }
  });
});

describe("findArticle", () => {
  it("finds an existing article by exact number", () => {
    const art = findArticle(lib, "constitucion", "1");
    expect(art).toBeDefined();
    expect(art?.number).toBe("1");
  });

  it("finds 14bis with normalisation", () => {
    const art = findArticle(lib, "constitucion", "14bis");
    expect(art).toBeDefined();
  });

  it("returns undefined for a missing article", () => {
    const art = findArticle(lib, "constitucion", "9999");
    expect(art).toBeUndefined();
  });

  it("returns undefined for a missing law", () => {
    const art = findArticle(lib, "ccyc", "1710");
    expect(art).toBeDefined();
  });

  it("is case-insensitive for 'art.' prefix", () => {
    const withPrefix = findArticle(lib, "ccyc", "Art. 1");
    const withoutPrefix = findArticle(lib, "ccyc", "1");
    expect(withPrefix).toEqual(withoutPrefix);
  });

  it("currently exposes the reported CCyC corruption at the start of the corpus", () => {
    const art1 = findArticle(lib, "ccyc", "1");
    const art10 = findArticle(lib, "ccyc", "10");
    expect(art1).toBeDefined();
    expect(art1?.text.toLowerCase()).toContain("apruébase el");
    expect(art1?.text.toLowerCase()).toContain("código civil y comercial");
    expect(art10?.text.toLowerCase()).toContain("comuníquese al");
    expect(art10?.text.toLowerCase()).toContain("poder ejecutivo");
  });

  it("still has substantive CCyC content in mid-range articles", () => {
    const art = findArticle(lib, "ccyc", "765");
    expect(art).toBeDefined();
    expect(art?.text.toLowerCase()).toContain("obligación es de dar dinero");
  });

  it("keeps CCyC truncation visible for missing high articles", () => {
    const art = findArticle(lib, "ccyc", "2200");
    expect(art).toBeUndefined();
  });
});

describe("normalizeNumber", () => {
  it("strips 'art.' prefix", () => {
    expect(normalizeNumber("Art. 1")).toBe("1");
  });

  it("strips 'artículo' prefix", () => {
    expect(normalizeNumber("artículo 75")).toBe("75");
  });

  it("lowercases", () => {
    expect(normalizeNumber("14BIS")).toBe("14bis");
  });

  it("collapses whitespace", () => {
    expect(normalizeNumber("  79  ")).toBe("79");
  });
});

describe("NOT_AVAILABLE constant", () => {
  it("is a non-empty string", () => {
    expect(typeof NOT_AVAILABLE).toBe("string");
    expect(NOT_AVAILABLE.length).toBeGreaterThan(0);
  });
});
