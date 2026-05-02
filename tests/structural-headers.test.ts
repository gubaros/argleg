import { describe, it, expect } from "vitest";
import {
  splitArticleHeaders,
  trimTrailingOrphans,
} from "../src/scripts/parsers/structural-headers.js";

describe("splitArticleHeaders", () => {
  it("returns text untouched when there are no structural keywords", () => {
    const text = "Este artículo regula la cosa.\nNo tiene headers trailing.";
    const { cleanText, trailingHeaders } = splitArticleHeaders(text);
    expect(trailingHeaders).toEqual([]);
    expect(cleanText).toBe(text);
  });

  it("strips a CAPÍTULO + subtitle pair appended to the article body", () => {
    // Mirrors CN art 35: ends with chapter transition before art 36.
    const text = [
      "Provincias Unidas del Río de la Plata, República Argentina,",
      "Confederación Argentina, serán en adelante nombres oficiales.",
      "",
      "CAPÍTULO SEGUNDO",
      "Nuevos derechos y garantías",
    ].join("\n");
    const { cleanText, trailingHeaders } = splitArticleHeaders(text);
    expect(cleanText).toContain("nombres oficiales.");
    expect(cleanText).not.toContain("CAPÍTULO");
    expect(trailingHeaders).toHaveLength(1);
    expect(trailingHeaders[0]!.tipo).toBe("capitulo");
    expect(trailingHeaders[0]!.nombre).toBe(
      "Capítulo Segundo — Nuevos derechos y garantías",
    );
  });

  it("strips a multi-level transition (PARTE + TÍTULO) and captures both headers", () => {
    // Mirrors CN art 43.
    const text = [
      "...resolverá de inmediato, aun durante la vigencia del estado de sitio.",
      "",
      "SEGUNDA PARTE",
      "",
      "AUTORIDADES DE LA NACION",
      "",
      "TITULO PRIMERO",
      "GOBIERNO FEDERAL",
    ].join("\n");
    const { cleanText, trailingHeaders } = splitArticleHeaders(text);
    expect(cleanText.trimEnd().endsWith("vigencia del estado de sitio.")).toBe(true);
    expect(trailingHeaders.map((h) => h.tipo)).toEqual(["parte", "titulo"]);
    expect(trailingHeaders[0]!.nombre).toBe("Segunda Parte — AUTORIDADES DE LA NACION");
    expect(trailingHeaders[1]!.nombre).toBe("Título Primero — GOBIERNO FEDERAL");
  });

  it("absorbs an unkeyworded ALL-CAPS orphan that precedes a real keyword", () => {
    // Mirrors CN art 86: "DEL PODER EJECUTIVO" is morally Sección Segunda
    // but the SECCIÓN keyword was lost upstream; CAPÍTULO PRIMERO follows.
    const text = [
      "La organización y el funcionamiento serán regulados por una ley especial.",
      "",
      "DEL PODER EJECUTIVO",
      "",
      "CAPÍTULO PRIMERO",
      "",
      "De su naturaleza y duración",
    ].join("\n");
    const { cleanText, trailingHeaders } = splitArticleHeaders(text);
    expect(cleanText).not.toContain("DEL PODER EJECUTIVO");
    expect(cleanText).not.toContain("CAPÍTULO");
    expect(trailingHeaders.length).toBeGreaterThanOrEqual(1);
    expect(trailingHeaders.find((h) => h.tipo === "capitulo")).toBeDefined();
  });
});

describe("trimTrailingOrphans", () => {
  it("strips an end-of-sentence ALL-CAPS phrase", () => {
    const text =
      "Se ausentara de la audiencia del juicio oral sin autorización. EL CIVILMENTE DEMANDADO";
    expect(trimTrailingOrphans(text).trimEnd().endsWith("autorización.")).toBe(true);
  });

  it("strips a single-word section marker like PRUEBA at end of text", () => {
    const text = "(Artículo sustituido por art. 2° de la Ley\nN° 25.488 B.O. 22/11/2001)\nPRUEBA";
    expect(trimTrailingOrphans(text)).not.toContain("PRUEBA");
  });

  it("handles inline keyword leakage like '...2018)TITULO II - JUICIO EJECUTIVO'", () => {
    const text =
      "(Artículo sustituido por Ley N° 27.449 B.O. 26/7/2018)TITULO II - JUICIO EJECUTIVO";
    expect(trimTrailingOrphans(text)).not.toContain("TITULO");
    expect(trimTrailingOrphans(text)).not.toContain("EJECUTIVO");
  });

  it("preserves citation suffixes (mostly digits)", () => {
    const text = "Texto del artículo. (Ley N° 27.449 B.O. 26/7/2018)";
    expect(trimTrailingOrphans(text)).toBe(text);
  });

  it("preserves articles ending normally with punctuation", () => {
    const text = "Las leyes de la Nación serán publicadas en el Boletín Oficial.";
    expect(trimTrailingOrphans(text)).toBe(text);
  });
});
