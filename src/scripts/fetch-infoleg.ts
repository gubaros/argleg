#!/usr/bin/env node
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { LAW_FILE_BY_ID, LawIdSchema, LawSchema } from "../laws/types.js";
import { extractArticlesForLaw, buildLaw } from "./infoleg.js";

interface Args {
  url?: string;
  file?: string;
  id: string;
  title?: string;
  shortName?: string;
  officialNumber?: string;
  description?: string;
  outDir?: string;
  dryRun: boolean;
  force: boolean;
}

const DEFAULT_TITLES: Record<string, { title: string; shortName: string; officialNumber?: string }> = {
  constitucion: {
    title: "Constitución de la Nación Argentina",
    shortName: "CN",
    officialNumber: "Constitución Nacional (texto ordenado 1994)",
  },
  ccyc: {
    title: "Código Civil y Comercial de la Nación",
    shortName: "CCyC",
    officialNumber: "Ley 26.994",
  },
  penal: {
    title: "Código Penal de la Nación Argentina",
    shortName: "CP",
    officialNumber: "Ley 11.179",
  },
  cppf: {
    title: "Código Procesal Penal Federal",
    shortName: "CPPF",
    officialNumber: "Ley 27.063",
  },
  cpccn: {
    title: "Código Procesal Civil y Comercial de la Nación",
    shortName: "CPCCN",
    officialNumber: "Ley 17.454",
  },
  ley_24240: {
    title: "Ley de Defensa del Consumidor",
    shortName: "LDC",
    officialNumber: "Ley 24.240",
  },
  ley_19550: {
    title: "Ley General de Sociedades",
    shortName: "LGS",
    officialNumber: "Ley 19.550",
  },
  ley_19549: {
    title: "Ley Nacional de Procedimientos Administrativos",
    shortName: "LNPA",
    officialNumber: "Ley 19.549",
  },
  ley_25326: {
    title: "Ley de Protección de los Datos Personales",
    shortName: "LPDP",
    officialNumber: "Ley 25.326",
  },
};

function usage(): void {
  process.stderr.write(
    [
      "",
      "Uso: npm run fetch -- --id <lawId> (--url <URL> | --file <path>) [opciones]",
      "",
      "Requerido:",
      "  --id <id>              constitucion | ccyc | penal | cppf | cpccn | ley_24240 | ley_19550 | ley_19549",
      "  --url <URL>            Descarga HTML desde la URL",
      "  --file <path>          O leer HTML de un archivo local",
      "",
      "Opcional:",
      '  --title "<string>"     Sobrescribe el título por defecto',
      '  --short "<string>"     Nombre corto (p.ej. "CCyC")',
      '  --official "<string>"  Número oficial (p.ej. "Ley 26.994")',
      '  --description "<str>"  Descripción',
      "  --out-dir <path>       Directorio de salida (default: ~/Desktop/mcp/data)",
      "  --dry-run              Imprime JSON en stdout en vez de escribir",
      "  --force                Sobrescribe el archivo si ya existe",
      "",
      "Ejemplo:",
      "  npm run fetch -- --id ley_24240 \\",
      "    --url 'http://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/638/texact.htm'",
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> = { dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    const v = argv[i + 1];
    switch (k) {
      case "--url":
        a.url = v;
        i++;
        break;
      case "--file":
        a.file = v;
        i++;
        break;
      case "--id":
        a.id = v;
        i++;
        break;
      case "--title":
        a.title = v;
        i++;
        break;
      case "--short":
        a.shortName = v;
        i++;
        break;
      case "--official":
        a.officialNumber = v;
        i++;
        break;
      case "--description":
        a.description = v;
        i++;
        break;
      case "--out-dir":
        a.outDir = v;
        i++;
        break;
      case "--dry-run":
        a.dryRun = true;
        break;
      case "--force":
        a.force = true;
        break;
      case "-h":
      case "--help":
        usage();
        process.exit(0);
      default:
        process.stderr.write(`[fetch-infoleg] Opción desconocida: ${k}\n`);
        usage();
        process.exit(2);
    }
  }
  if (!a.id) {
    usage();
    process.exit(2);
  }
  return a as Args;
}

async function readHtml(args: Args): Promise<{ html: string; source: string }> {
  if (args.file) {
    const abs = path.resolve(args.file);
    const buf = await readFile(abs);
    let html = buf.toString("utf8");
    if (looksMojibake(html)) {
      // InfoLEG actually serves CP1252 (Windows-1252), not strict ISO-8859-1.
      // Bytes 0x80-0x9F encode typographic chars (— – ' " … etc.) in CP1252 but
      // map to invisible control chars in Latin-1. Node's TextDecoder("windows-1252")
      // leaves these bytes as U+0080-U+009F, so we remap them manually.
      html = decodeCp1252(buf);
    }
    return { html, source: abs };
  }
  if (args.url) {
    // InfoLEG rejects generic UAs on some paths (HTTP 403). Use a browser UA.
    const res = await fetch(args.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        "Referer": "https://www.infoleg.gob.ar/",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${args.url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // InfoLEG sometimes serves ISO-8859-1. Try UTF-8 first; fall back on replacement chars.
    let html = buf.toString("utf8");
    if (looksMojibake(html)) {
      // InfoLEG actually serves CP1252 (Windows-1252), not strict ISO-8859-1.
      // Bytes 0x80-0x9F encode typographic chars (— – ' " … etc.) in CP1252 but
      // map to invisible control chars in Latin-1. Node's TextDecoder("windows-1252")
      // leaves these bytes as U+0080-U+009F, so we remap them manually.
      html = decodeCp1252(buf);
    }
    return { html, source: args.url };
  }
  throw new Error("Falta --url o --file");
}

/**
 * Decode a Buffer as Windows-1252. Node's TextDecoder("windows-1252") has a
 * known limitation where it leaves bytes 0x80-0x9F as the matching Unicode
 * code point instead of mapping them to the typographic chars defined by the
 * CP1252 spec. We start from latin1 and remap the affected range manually.
 */
function decodeCp1252(buf: Buffer): string {
  const CP1252_HIGH: Record<number, string> = {
    0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†",
    0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ",
    0x8e: "Ž", 0x91: "'", 0x92: "'", 0x93: "“", 0x94: "”",
    0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š",
    0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
  };
  let out = "";
  for (const b of buf) {
    if (b >= 0x80 && b <= 0x9f && CP1252_HIGH[b]) {
      out += CP1252_HIGH[b];
    } else {
      out += String.fromCharCode(b);
    }
  }
  return out;
}

function looksMojibake(s: string): boolean {
  // Heuristic: UTF-8 decoding of latin1 text leaves many  replacement chars.
  const replacements = (s.match(/�/g) ?? []).length;
  return replacements > 10;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const id = LawIdSchema.parse(args.id);

  const { html, source } = await readHtml(args);
  process.env.ARGLEG_WRITE_PARSER_LOGS = "1";
  const articles = extractArticlesForLaw(id, html);
  delete process.env.ARGLEG_WRITE_PARSER_LOGS;

  if (articles.length === 0) {
    throw new Error(
      "No se detectaron artículos. Revisá el HTML fuente o el parser específico en src/scripts/parsers/.",
    );
  }

  const defaults = DEFAULT_TITLES[id];
  const law = buildLaw(
    {
      id,
      title: args.title ?? defaults?.title ?? id,
      shortName: args.shortName ?? defaults?.shortName ?? id.toUpperCase(),
      officialNumber: args.officialNumber ?? defaults?.officialNumber,
      source,
      description: args.description,
    },
    articles,
  );

  const parsed = LawSchema.parse(law);
  const payload = JSON.stringify(parsed, null, 2) + "\n";

  if (args.dryRun) {
    process.stdout.write(payload);
    process.stderr.write(
      `[fetch-infoleg] ${articles.length} artículos extraídos (dry-run).\n`,
    );
    return;
  }

  const outDir =
    args.outDir ?? path.join(homedir(), "Desktop", "mcp", "data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, LAW_FILE_BY_ID[id]);

  const exists = await fileExists(outPath);
  if (exists && !args.force) {
    throw new Error(
      `${outPath} ya existe. Usá --force para sobrescribir o --dry-run para inspeccionar.`,
    );
  }

  await writeFile(outPath, payload, "utf8");
  process.stderr.write(
    `[fetch-infoleg] OK — ${articles.length} artículos → ${outPath}\n`,
  );
  process.stderr.write(
    `[fetch-infoleg] Recordá revisar el resultado y completar location/materia/incisos si corresponde.\n`,
  );
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[fetch-infoleg] ${msg}\n`);
  process.exit(1);
});
