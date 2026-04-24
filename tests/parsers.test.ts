import { describe, expect, it } from "vitest";
import { extractArticlesForLaw } from "../src/scripts/infoleg.js";

describe("parsers by corpus", () => {
  it("uses a specific CCyC parser that skips approving law and reaches final article", () => {
    const html = [
      "<div id='Contenido'>",
      "Ley 26.994<br>ARTICULO 1 — Apruébase el Código Civil y Comercial.<br>",
      "ARTICULO 10 — Comuníquese al Poder Ejecutivo.<br>",
      "ANEXO I<br>TITULO PRELIMINAR<br>",
      "ARTICULO 1.- Fuentes y aplicación.<br>",
      "ARTICULO 2.- Interpretación.<br>",
      "ANEXO II<br>modificaciones...",
      "</div>",
    ].join("");
    const arts = extractArticlesForLaw("ccyc", html);
    expect(arts.map((a) => a.number)).toEqual(["1", "2"]);
    expect(arts[0]?.text).toContain("Fuentes y aplicación");
  });

  it("uses a specific CPPF parser that ignores TOC ranges and cuts at ANEXO II", () => {
    const html = [
      "<div id='Contenido'>",
      "art. 1 a 24<br>art. 25 a 29<br>",
      "ANEXO I<br>CODIGO PROCESAL PENAL DE LA NACION<br>",
      "Artículo 1°- Juicio previo.<br>",
      "Artículo 2°- Principios del proceso acusatorio.<br>",
      "ANEXO II<br>Artículo 1°- Programa de implementación.<br>",
      "</div>",
    ].join("");
    const arts = extractArticlesForLaw("cppf", html);
    expect(arts.map((a) => a.number)).toEqual(["1", "2"]);
    expect(arts[0]?.text).toContain("Juicio previo");
  });

  it("uses a specific CPCCN parser that preserves full article bodies and cuts before antecedentes", () => {
    const html = [
      "<div id='Contenido'>",
      "Art. 1° - Competencia.<br>",
      "CAPITULO II - CUESTIONES DE COMPETENCIA<br>",
      "Art. 2° - Prórroga.<br>",
      "Antecedentes Normativos<br>",
      "Art. 999 - ruido<br>",
      "</div>",
    ].join("");
    const arts = extractArticlesForLaw("cpccn", html);
    expect(arts.map((a) => a.number)).toEqual(["1", "2"]);
    expect(arts[0]?.text).toContain("Competencia");
    expect(arts[1]?.text).toContain("Prórroga");
  });

  it("uses a specific Constitución parser that skips publication text and starts at the constitutional article 1", () => {
    const html = [
      "<div id='Contenido'>",
      "Ordénase la publicación del texto oficial...<br>",
      "Artículo 1º.- La Nación Argentina adopta para su gobierno...<br>",
      "Artículo 2º.- El Gobierno federal sostiene...<br>",
      "</div>",
    ].join("");
    const arts = extractArticlesForLaw("constitucion", html);
    expect(arts.map((a) => a.number)).toEqual(["1", "2"]);
    expect(arts[0]?.text).toContain("La Nación Argentina adopta");
  });

  it("uses a specific Penal parser that captures articles with quinquies suffix", () => {
    const html = [
      "<div id='Contenido'>",
      "Artículo 1.- Este Código se aplicará...<br>",
      "ARTICULO 41 quinquies — Cuando alguno de los delitos...<br>",
      "Artículo 42.- El que...<br>",
      "Antecedentes Normativos<br>",
      "</div>",
    ].join("");
    const arts = extractArticlesForLaw("penal", html);
    expect(arts.map((a) => a.number)).toContain("41quinquies");
  });

  it("uses a specific LDC parser that captures bis articles", () => {
    const html = [
      "<div id='Contenido'>",
      "ARTICULO 1º — Objeto...<br>",
      "ARTICULO 8º bis: Trato digno...<br>",
      "ARTICULO 9º — Cosas usadas...<br>",
      "Antecedentes Normativos<br>",
      "</div>",
    ].join("");
    const arts = extractArticlesForLaw("ley_24240", html);
    expect(arts.map((a) => a.number)).toContain("8bis");
  });
});
