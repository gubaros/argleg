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
});
