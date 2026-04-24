import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractArticles,
  parseArticlesFromText,
  buildLaw,
} from "../src/scripts/infoleg.js";
import { LawSchema } from "../src/laws/types.js";

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "sample-infoleg.html",
);

describe("extractArticles (HTML)", () => {
  it("extracts 4 articles from the fixture", async () => {
    const html = await readFile(FIXTURE, "utf8");
    const arts = extractArticles(html);
    expect(arts).toHaveLength(4);
  });

  it("captures article 14 bis with normalization", async () => {
    const html = await readFile(FIXTURE, "utf8");
    const arts = extractArticles(html);
    expect(arts.map((a) => a.number)).toContain("14bis");
  });

  it("captures article 75", async () => {
    const html = await readFile(FIXTURE, "utf8");
    const arts = extractArticles(html);
    expect(arts.map((a) => a.number)).toContain("75");
  });

  it("keeps body text on article 1", async () => {
    const html = await readFile(FIXTURE, "utf8");
    const arts = extractArticles(html);
    const art1 = arts.find((a) => a.number === "1");
    expect(art1?.text).toContain("ámbito de aplicación");
  });

  it("joins multi-paragraph article 2", async () => {
    const html = await readFile(FIXTURE, "utf8");
    const arts = extractArticles(html);
    const art2 = arts.find((a) => a.number === "2");
    expect(art2?.text).toContain("sujetos obligados");
    expect(art2?.text).toContain("Segundo párrafo");
  });
});

describe("parseArticlesFromText", () => {
  it("handles the 'ARTICULO' marker", () => {
    const text = "ARTICULO 1° — texto uno\nARTICULO 2° — texto dos";
    const arts = parseArticlesFromText(text);
    expect(arts).toHaveLength(2);
    expect(arts[0]!.text).toBe("texto uno");
    expect(arts[1]!.text).toBe("texto dos");
  });

  it("handles the 'Art.' marker", () => {
    const text = "Art. 5 — texto";
    const arts = parseArticlesFromText(text);
    expect(arts).toHaveLength(1);
    expect(arts[0]!.number).toBe("5");
  });

  it("does not treat table-of-contents ranges as article headers", () => {
    const text = "art. 1 a 24\nArt. 25.- Texto válido";
    const arts = parseArticlesFromText(text);
    expect(arts).toHaveLength(1);
    expect(arts[0]!.number).toBe("25");
  });

  it("dedupes duplicate article numbers", () => {
    const text = "ARTICULO 1 — primera\nARTICULO 1 — duplicada";
    const arts = parseArticlesFromText(text);
    expect(arts).toHaveLength(1);
    expect(arts[0]!.text).toBe("primera");
  });

  it("keeps generic parseArticlesFromText focused on article tokenization only", () => {
    const text = "ARTICULO 1° — primera\nARTICULO 2° — segunda";
    const arts = parseArticlesFromText(text);
    expect(arts).toHaveLength(2);
    expect(arts[0]!.number).toBe("1");
    expect(arts[1]!.number).toBe("2");
  });

  it("returns empty array when no article header exists", () => {
    const arts = parseArticlesFromText("esto no es una ley");
    expect(arts).toHaveLength(0);
  });
});

describe("buildLaw", () => {
  it("produces a schema-valid Law object", () => {
    const law = buildLaw(
      {
        id: "ley_24240",
        title: "Test",
        shortName: "T",
        source: "https://example.test",
      },
      [{ number: "1", text: "hola", incisos: [], location: {}, materia: [] }],
    );
    expect(() => LawSchema.parse(law)).not.toThrow();
  });

  it("defaults lastUpdated to today", () => {
    const law = buildLaw(
      { id: "penal", title: "T", shortName: "T", source: "s" },
      [{ number: "1", text: "x", incisos: [], location: {}, materia: [] }],
    );
    expect(law.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
