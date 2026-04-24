import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLibrary, findArticle, type LoadedLibrary } from "../src/laws/loader.js";
import { formatArticle, formatLawSummary, formatHit } from "../src/laws/format.js";
import { searchArticles } from "../src/laws/search.js";

const DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
);

let lib: LoadedLibrary;

beforeAll(async () => {
  lib = await loadLibrary({ dataDir: DATA_DIR });
});

describe("formatArticle", () => {
  it("includes article number in output", () => {
    const law = lib.laws.get("constitucion")!;
    const art = findArticle(lib, "constitucion", "1")!;
    const out = formatArticle("constitucion", law, art);
    expect(out).toContain("Art. 1");
  });

  it("includes law shortName", () => {
    const law = lib.laws.get("ccyc")!;
    const art = findArticle(lib, "ccyc", "1")!;
    const out = formatArticle("ccyc", law, art);
    expect(out).toContain("CCyC");
  });

  it("includes source", () => {
    const law = lib.laws.get("penal")!;
    const art = findArticle(lib, "penal", "79")!;
    const out = formatArticle("penal", law, art);
    expect(out).toContain("infoleg");
  });

  it("renders incisos when present", () => {
    const law = lib.laws.get("ccyc")!;
    // Build a synthetic article with structured incisos so the test is
    // independent of whether the live data keeps incisos structured or inlined.
    const synthetic = {
      number: "test",
      title: "Ejemplo",
      text: "Texto del artículo",
      incisos: [
        { id: "a", text: "primero" },
        { id: "b", text: "segundo" },
      ],
      location: {},
      materia: [],
    };
    const out = formatArticle("ccyc", law, synthetic);
    expect(out).toContain("**a)**");
    expect(out).toContain("**b)**");
  });
});

describe("formatLawSummary", () => {
  it("includes law title", () => {
    const law = lib.laws.get("constitucion")!;
    const out = formatLawSummary(law);
    expect(out).toContain("Constitución");
  });

  it("includes article count", () => {
    const law = lib.laws.get("ccyc")!;
    const out = formatLawSummary(law);
    expect(out).toContain(`${law.articles.length}`);
  });
});

describe("formatHit", () => {
  it("returns a non-empty string for a valid hit", () => {
    const hits = searchArticles(lib, { query: "gobierno" });
    if (hits.length > 0) {
      const out = formatHit(hits[0]!);
      expect(typeof out).toBe("string");
      expect(out.length).toBeGreaterThan(0);
    }
  });
});
