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

  it("extracts numbered incisos for constitutional articles that use them", () => {
    const html = [
      "<div id='Contenido'>",
      "Artículo 1º.- La Nación Argentina adopta para su gobierno...<br>",
      "Artículo 75.- Corresponde al Congreso: 1. Legislar en materia aduanera. 2. Imponer contribuciones indirectas. 3. Establecer y modificar asignaciones específicas.<br>",
      "</div>",
    ].join("");
    const arts = extractArticlesForLaw("constitucion", html);
    const art75 = arts.find((a) => a.number === "75");
    expect(art75?.incisos.length).toBe(3);
    expect(art75?.incisos[0]?.id).toBe("1");
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

  it("extracts numeric incisos for Penal when the article supports them", () => {
    const html = [
      "<div id='Contenido'>",
      "Artículo 1.- Este Código se aplicará: 1) uno. 2) dos.<br>",
      "Artículo 2.- Siguiente.<br>",
      "Antecedentes Normativos<br>",
      "</div>",
    ].join("");
    const arts = extractArticlesForLaw("penal", html);
    expect(arts[0]?.incisos.map((x) => x.id)).toEqual(["1", "2"]);
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

  it("captures location context for CCyC articles", () => {
    const html = [
      "<div id='Contenido'>",
      "ANEXO I<br>TITULO PRELIMINAR<br>CAPITULO 1<br>",
      "ARTICULO 1.- Fuentes y aplicación.<br>",
      "LIBRO PRIMERO - PARTE GENERAL<br>TITULO I - Persona humana<br>CAPITULO 1 - Comienzo de la existencia<br>",
      "ARTICULO 19.- Comienzo de la existencia.<br>",
      "ANEXO II<br>",
      "</div>",
    ].join("");
    const arts = extractArticlesForLaw("ccyc", html);
    expect(arts[0]?.location.titulo).toBe("PRELIMINAR");
    expect(arts[1]?.location.libro).toBe("PRIMERO");
    expect(arts[1]?.location.titulo).toBe("I");
    expect(arts[1]?.location.capitulo).toBe("1");
  });

  it("extracts lettered incisos for CCyC articles when supported by the article itself", () => {
    const html = [
      "<div id='Contenido'>",
      "ANEXO I<br>TITULO PRELIMINAR<br>CAPITULO 1<br>",
      "ARTICULO 1.- Texto simple.<br>",
      "ARTICULO 2.- Reglas: a) uno; b) dos; c) tres.<br>",
      "ANEXO II<br>",
      "</div>",
    ].join("");
    const arts = extractArticlesForLaw("ccyc", html);
    const art2 = arts.find((a) => a.number === "2");
    expect(art2?.incisos.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(art2?.text).toBe("Reglas:");
  });

  it("captures location context for CPPF articles", () => {
    const html = [
      "<div id='Contenido'>",
      "ANEXO I<br>PRIMERA PARTE - PARTE GENERAL<br>LIBRO PRIMERO - PRINCIPIOS FUNDAMENTALES<br>TITULO I<br>Artículo 1°- Juicio previo.<br>",
      "Capítulo 2<br>Actos de inicio<br>Artículo 202.- Actos de inicio.<br>",
      "ANEXO II<br>",
      "</div>",
    ].join("");
    const arts = extractArticlesForLaw("cppf", html);
    expect(arts[0]?.location.parte).toContain("PRIMERA");
    expect(arts[0]?.location.libro).toBe("PRIMERO");
    expect(arts[0]?.location.titulo).toBe("I");
    expect(arts[1]?.location.capitulo).toBe("2");
  });

  it("captures location context for CPCCN articles", () => {
    const html = [
      "<div id='Contenido'>",
      "LIBRO PRIMERO - DISPOSICIONES GENERALES<br>TITULO I - ORGANO JUDICIAL<br>CAPITULO I - COMPETENCIA<br>",
      "Art. 1° - Competencia.<br>",
      "TITULO II - PARTES<br>CAPITULO I - ACTOR Y DEMANDADO<br>Art. 30. - Actor.<br>",
      "Antecedentes Normativos<br>",
      "</div>",
    ].join("");
    const arts = extractArticlesForLaw("cpccn", html);
    expect(arts[0]?.location.libro).toBe("PRIMERO");
    expect(arts[0]?.location.titulo).toBe("I");
    expect(arts[0]?.location.capitulo).toBe("I");
    expect(arts[1]?.location.titulo).toBe("II");
  });
});
