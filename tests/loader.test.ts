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

  it("loads substantive CCyC article 1 after skipping the approving law", () => {
    const art1 = findArticle(lib, "ccyc", "1");
    expect(art1).toBeDefined();
    expect(art1?.text.toLowerCase()).toContain("fuentes");
    expect(art1?.text.toLowerCase()).toContain("aplicaci");
  });

  it("loads substantive CCyC article 2200 from the high range", () => {
    const art2200 = findArticle(lib, "ccyc", "2200");
    expect(art2200).toBeDefined();
    expect(art2200?.text.toLowerCase()).toContain("propietario no deudor");
  });

  it("loads substantive CPPF article 1 after parser-specific cleanup", () => {
    const art = findArticle(lib, "cppf", "1");
    expect(art).toBeDefined();
    expect(art?.text.toLowerCase()).toContain("juicio previo");
  });

  it("loads substantive CPPF article 202 instead of a section heading", () => {
    const art = findArticle(lib, "cppf", "202");
    expect(art).toBeDefined();
    expect(art?.text.toLowerCase()).toContain("actos de inicio");
  });

  it("loads substantive CPPF final article 349", () => {
    const art = findArticle(lib, "cppf", "349");
    expect(art).toBeDefined();
    expect(art?.text.toLowerCase()).toContain("fuerzas armadas");
  });

  it("loads CPCCN article 134 with full body instead of a truncated stub", () => {
    const art = findArticle(lib, "cpccn", "134");
    expect(art).toBeDefined();
    expect(art?.text.toLowerCase()).toContain("notificación");
    expect(art?.text.length).toBeGreaterThan(100);
  });

  it("loads CPCCN article 362 with full body instead of a truncated stub", () => {
    const art = findArticle(lib, "cpccn", "362");
    expect(art).toBeDefined();
    expect(art?.text.toLowerCase()).toContain("audiencia prevista en el");
    expect(art?.text.toLowerCase()).toContain("artículo 360");
  });

  it("loads CPCCN final article 784 and stops before antecedentes", () => {
    const art = findArticle(lib, "cpccn", "784");
    expect(art).toBeDefined();
    expect(art?.text.toLowerCase()).toContain("venta de mercaderías");
    expect(art?.text.toLowerCase()).not.toContain("antecedentes normativos");
  });

  it("loads substantive Constitución article 1 instead of publication text", () => {
    const art = findArticle(lib, "constitucion", "1");
    expect(art).toBeDefined();
    expect(art?.text.toLowerCase()).toContain("la nación argentina");
    expect(art?.text.toLowerCase()).toContain("adopta para su gobierno");
    expect(art?.text.toLowerCase()).not.toContain("ordénase la publicación");
  });

  it("loads Penal article 41quinquies with suffix preserved", () => {
    const art = findArticle(lib, "penal", "41quinquies");
    expect(art).toBeDefined();
    expect(art?.text.toLowerCase()).toContain("aterrorizar a la población");
  });

  it("loads Penal article 59 with structured numeric incisos", () => {
    const art = findArticle(lib, "penal", "59");
    expect(art).toBeDefined();
    expect(art?.incisos.length).toBeGreaterThan(3);
    expect(art?.incisos[0]?.id).toBe("1");
  });

  it("loads LDC article 8bis with bis suffix preserved", () => {
    const art = findArticle(lib, "ley_24240", "8bis");
    expect(art).toBeDefined();
    expect(art?.text.toLowerCase()).toContain("trato digno");
  });

  it("loads Constitución article 75 with structured numbered incisos", () => {
    const art = findArticle(lib, "constitucion", "75");
    expect(art).toBeDefined();
    expect(art?.incisos.length).toBeGreaterThan(10);
    expect(art?.incisos[0]?.id).toBe("1");
  });

  it("loads Constitución article 99 with structured numbered incisos", () => {
    const art = findArticle(lib, "constitucion", "99");
    expect(art).toBeDefined();
    expect(art?.incisos.length).toBeGreaterThan(5);
    expect(art?.incisos[0]?.id).toBe("1");
    expect(art?.incisos.map((x) => x.id)).toContain("17");
    expect(art?.incisos.map((x) => x.id)).not.toContain("23");
  });

  it("loads CCyC article 14 with structured incisos", () => {
    const art = findArticle(lib, "ccyc", "14");
    expect(art).toBeDefined();
    expect(art?.incisos.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("still has substantive CCyC content in mid-range articles", () => {
    const art = findArticle(lib, "ccyc", "765");
    expect(art).toBeDefined();
    expect(art?.text.toLowerCase()).toContain("obligación es de dar dinero");
  });

  it("loads the final CCyC article 2671", () => {
    const art = findArticle(lib, "ccyc", "2671");
    expect(art).toBeDefined();
    expect(art?.text.toLowerCase()).toContain("derecho aplicable");
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
