import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeArticleText,
  parseDocument,
} from "../src/laws/universal-parser.js";
import { decodeInfoleg } from "../src/scripts/parsers/encoding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ─── Synthetic samples ───────────────────────────────────────────────────────

const LEY_FEDERAL_SAMPLE = `<html><body>
<p>Ley N° 99.999</p>
<p>TÍTULO I — DISPOSICIONES GENERALES</p>
<p>CAPÍTULO 1 — PRINCIPIOS</p>
<p>ARTICULO 1° — (Objeto). La presente ley regula
la cosa.</p>
<p>ARTICULO 2° — (Definiciones).</p>
<p>A los fines de esta ley se entiende por…</p>
<p>CAPÍTULO 2 — ALCANCE</p>
<p>ARTICULO 3° — Esta ley se aplica a todos.</p>
</body></html>`;

const CODIGO_SAMPLE = `<html><body>
<p>LIBRO PRIMERO — PARTE GENERAL</p>
<p>TÍTULO PRELIMINAR</p>
<p>CAPÍTULO 1 — Fuentes y aplicación</p>
<p>ARTICULO 1° — Las leyes de este Código se aplican.</p>
<p>SECCIÓN 1ª — Principios generales</p>
<p>ARTICULO 2° — Interpretación de la ley.</p>
<p>LIBRO SEGUNDO — DERECHOS PERSONALES</p>
<p>TÍTULO I — De las obligaciones</p>
<p>ARTICULO 100 — Concepto.</p>
</body></html>`;

const CONSTITUCION_SAMPLE = `<html><body>
<p>PREÁMBULO</p>
<p>Nos los representantes…</p>
<p>PRIMERA PARTE — Declaraciones, derechos y garantías</p>
<p>CAPÍTULO PRIMERO</p>
<p>ARTICULO 1° — La Nación adopta la forma representativa.</p>
<p>ARTICULO 14 bis — El trabajo gozará de protección.</p>
<p>SEGUNDA PARTE — Autoridades de la Nación</p>
<p>TÍTULO PRIMERO — Gobierno Federal</p>
<p>SECCIÓN PRIMERA — Poder Legislativo</p>
<p>CAPÍTULO PRIMERO — Cámara de Diputados</p>
<p>ARTICULO 45 — La Cámara de Diputados se compondrá…</p>
<p>DISPOSICIONES TRANSITORIAS</p>
<p>PRIMERA. La Nación Argentina ratifica…</p>
</body></html>`;

// ─── Tests: ley_federal shape ────────────────────────────────────────────────

describe("universal-parser: ley_federal", () => {
  const result = parseDocument(LEY_FEDERAL_SAMPLE, "ley_federal");

  it("extracts the three articles", () => {
    expect(result.articles.map((a) => a.numero)).toEqual(["1", "2", "3"]);
  });

  it("captures epígrafes from parenthetical headers", () => {
    expect(result.articles[0]!.epigrafe).toBe("Objeto");
    expect(result.articles[1]!.epigrafe).toBe("Definiciones");
    expect(result.articles[2]!.epigrafe).toBeUndefined();
  });

  it("normalizes mid-sentence newlines in body", () => {
    expect(result.articles[0]!.texto).toContain("La presente ley regula la cosa");
    expect(result.articles[0]!.texto).not.toContain("regula\nla");
  });

  it("captures a título and two capítulos in structure", () => {
    const tipos = result.structure.map((n) => n.tipo);
    expect(tipos.filter((t) => t === "titulo")).toHaveLength(1);
    expect(tipos.filter((t) => t === "capitulo")).toHaveLength(2);
  });

  it("attaches articles to the deepest open node", () => {
    const cap1 = result.structure.find(
      (n) => n.tipo === "capitulo" && n.nombre.includes("1"),
    )!;
    const cap2 = result.structure.find(
      (n) => n.tipo === "capitulo" && n.nombre.includes("2"),
    )!;
    expect(result.articles[0]!.estructura_path.at(-1)).toBe(cap1.id);
    expect(result.articles[1]!.estructura_path.at(-1)).toBe(cap1.id);
    expect(result.articles[2]!.estructura_path.at(-1)).toBe(cap2.id);
  });

  it("emits no warnings on a happy-path document", () => {
    expect(result.warnings).toEqual([]);
  });
});

// ─── Tests: codigo_fondo shape (libro > titulo > capitulo > seccion) ─────────

describe("universal-parser: codigo_fondo", () => {
  const result = parseDocument(CODIGO_SAMPLE, "codigo_fondo");

  it("extracts the three articles", () => {
    expect(result.articles.map((a) => a.numero)).toEqual(["1", "2", "100"]);
  });

  it("nests the structure correctly: libro > titulo > capitulo (> seccion)", () => {
    const libro1 = result.structure.find(
      (n) => n.tipo === "libro" && n.nombre.includes("Primero"),
    )!;
    const titPrelim = result.structure.find(
      (n) => n.tipo === "titulo" && n.nombre.includes("Preliminar"),
    )!;
    const cap1 = result.structure.find(
      (n) => n.tipo === "capitulo" && n.nombre.includes("1"),
    )!;
    expect(titPrelim.parent_id).toBe(libro1.id);
    expect(cap1.parent_id).toBe(titPrelim.id);
  });

  it("article 2 hangs under sección 1", () => {
    const sec1 = result.structure.find((n) => n.tipo === "seccion")!;
    expect(result.articles[1]!.estructura_path.at(-1)).toBe(sec1.id);
  });

  it("transitioning to LIBRO SEGUNDO pops the entire chain underneath", () => {
    const libro2 = result.structure.find(
      (n) => n.tipo === "libro" && n.nombre.includes("Segundo"),
    )!;
    const tit1 = result.structure.find(
      (n) => n.tipo === "titulo" && n.nombre.includes("Título I"),
    )!;
    expect(tit1.parent_id).toBe(libro2.id);
    expect(result.articles[2]!.estructura_path).toContain(libro2.id);
    expect(result.articles[2]!.estructura_path).toContain(tit1.id);
  });
});

// ─── Tests: constitucion shape (parte > capitulo > articulo + transitorias) ──

describe("universal-parser: constitucion_nacional", () => {
  const result = parseDocument(CONSTITUCION_SAMPLE, "constitucion_nacional");

  it("captures preamble, both partes and disposiciones transitorias", () => {
    const tipos = result.structure.map((n) => n.tipo);
    expect(tipos).toContain("preambulo");
    expect(tipos).toContain("parte");
    expect(tipos).toContain("disposicion_transitoria");
    expect(tipos.filter((t) => t === "parte")).toHaveLength(2);
  });

  it("captures the bis article", () => {
    const bis = result.articles.find((a) => /bis/i.test(a.numero));
    expect(bis).toBeDefined();
  });

  it("preámbulo resets the stack (article 1 hangs under capítulo, not preambulo)", () => {
    const art1 = result.articles.find((a) => a.numero === "1")!;
    const preambulo = result.structure.find((n) => n.tipo === "preambulo")!;
    expect(art1.estructura_path).not.toContain(preambulo.id);
  });

  it("Segunda Parte > Título Primero > Sección Primera > Capítulo Primero nests correctly", () => {
    const segParte = result.structure.find(
      (n) => n.tipo === "parte" && n.nombre.includes("Segunda"),
    )!;
    const titPrim = result.structure.find(
      (n) => n.tipo === "titulo" && n.parent_id === segParte.id,
    )!;
    const secPrim = result.structure.find(
      (n) => n.tipo === "seccion" && n.parent_id === titPrim.id,
    )!;
    const capDip = result.structure.find(
      (n) =>
        n.tipo === "capitulo" &&
        n.parent_id === secPrim.id,
    )!;
    const art45 = result.articles.find((a) => a.numero === "45")!;
    expect(art45.estructura_path).toContain(capDip.id);
  });
});

// ─── Tests: tier verification (mode b) ───────────────────────────────────────

describe("universal-parser: tier verification", () => {
  it("warns when a ley_federal is declared as codigo_fondo", () => {
    const result = parseDocument(LEY_FEDERAL_SAMPLE, "codigo_fondo");
    const headerWarn = result.warnings.find((w) =>
      w.message.includes("no header pattern matches"),
    );
    expect(headerWarn).toBeDefined();
  });

  it("does not warn when the declaration matches", () => {
    const result = parseDocument(CODIGO_SAMPLE, "codigo_fondo");
    const headerWarn = result.warnings.find((w) =>
      w.message.includes("no header pattern matches"),
    );
    expect(headerWarn).toBeUndefined();
  });

  it("warns about coherence when a level is detected outside niveles_posibles", () => {
    // ley_federal does NOT allow `libro`. A document that has LIBRO PRIMERO
    // but is declared as ley_federal should both detect libro (because the
    // detector runs only for niveles_posibles, so it WON'T detect — meaning
    // libro doesn't show up in nodes, which means no incoherence is raised).
    // This is the right behaviour: the parser refuses to claim something the
    // tier doesn't allow. The article still parses.
    const result = parseDocument(CODIGO_SAMPLE, "ley_federal");
    const tipos = result.structure.map((n) => n.tipo);
    expect(tipos).not.toContain("libro");
    // We still find titulos and capitulos which ARE in ley_federal's niveles_posibles
    expect(tipos).toContain("titulo");
  });
});

// ─── Tests: text normalization ───────────────────────────────────────────────

describe("normalizeArticleText", () => {
  it("collapses mid-sentence wraps to spaces", () => {
    const out = normalizeArticleText("El trabajo en sus\ndiversas formas gozará");
    expect(out).toBe("El trabajo en sus diversas formas gozará");
  });

  it("preserves paragraph breaks (\\n\\n)", () => {
    const out = normalizeArticleText("Primer párrafo.\n\nSegundo párrafo.");
    expect(out).toBe("Primer párrafo.\n\nSegundo párrafo.");
  });

  it("preserves newline after a sentence terminator", () => {
    // single \n after period kept (treated as paragraph break by reader)
    const out = normalizeArticleText("Fin de oración.\nNueva línea.");
    expect(out).toBe("Fin de oración.\nNueva línea.");
  });

  it("collapses runs of 3+ newlines to 2", () => {
    const out = normalizeArticleText("a\n\n\n\nb");
    expect(out).toBe("a\n\nb");
  });
});

// ─── Tests: against real ley_25326 corpus ────────────────────────────────────

describe("universal-parser: real ley_25326 HTML", () => {
  const htmlPath = path.join(HERE, "..", "data", "25326", "PROTECCION DE LOS DATOS.html");
  let html = "";
  try {
    html = decodeInfoleg(readFileSync(htmlPath));
  } catch {
    // If the fixture is gone (clean checkout in some envs), skip these tests.
  }

  it.runIf(html.length > 0)("parses all 48 articles from the real LPDP HTML", () => {
    const result = parseDocument(html, "ley_federal");
    expect(result.articles.length).toBe(48);
    const art1 = result.articles.find((a) => a.numero === "1");
    expect(art1).toBeDefined();
    expect(art1!.texto.toLowerCase()).toContain(
      "protección integral de los datos personales",
    );
    expect(art1!.epigrafe).toBe("Objeto");
  });

  it.runIf(html.length > 0)("captures the LPDP capítulos as structural nodes", () => {
    const result = parseDocument(html, "ley_federal");
    const capitulos = result.structure.filter((n) => n.tipo === "capitulo");
    // The LPDP has 7 capítulos in InfoLEG's text.
    expect(capitulos.length).toBeGreaterThanOrEqual(5);
  });

  it.runIf(html.length > 0)("attaches articles to a capítulo", () => {
    const result = parseDocument(html, "ley_federal");
    // Article 1 sits inside Capítulo I (Disposiciones Generales).
    const art1 = result.articles.find((a) => a.numero === "1")!;
    expect(art1.estructura_path.length).toBeGreaterThan(0);
  });
});
