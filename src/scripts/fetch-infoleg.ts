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
};

function usage(): void {
  process.stderr.write(
    [
      "",
      "Uso: npm run fetch -- --id <lawId> (--url <URL> | --file <path>) [opciones]",
      "",
      "Requerido:",
      "  --id <id>              constitucion | ccyc | penal | cppf | cpccn | ley_24240",
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
      html = buf.toString("latin1");
    }
    return { html, source: abs };
  }
  if (args.url) {
    // InfoLEG rejects generic UAs on some paths (HTTP 403). Use a browser UA.
    const res = await fetch(args.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
      html = buf.toString("latin1");
    }
    return { html, source: args.url };
  }
  throw new Error("Falta --url o --file");
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
  const articles = extractArticlesForLaw(id, html);

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
