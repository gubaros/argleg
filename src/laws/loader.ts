import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import {
  LAW_FILE_BY_ID,
  LAW_IDS,
  LawId,
  LawSchema,
  type Article,
  type Law,
} from "./types.js";

export const NOT_AVAILABLE = "norma no disponible en la base local";

export interface LoaderOptions {
  dataDir?: string;
}

export interface LoadedLibrary {
  dataDir: string;
  laws: Map<LawId, Law>;
  missing: LawId[];
  errors: Array<{ law: LawId; error: string }>;
}

/**
 * Resolves ~/Desktop/mcp/data as default, but allows override via env or option.
 * The code MUST NOT read data from anywhere else.
 */
export function resolveDataDir(opts: LoaderOptions = {}): string {
  if (opts.dataDir) return path.resolve(opts.dataDir);
  const fromEnv = process.env.ARGLEG_DATA_DIR;
  if (fromEnv && fromEnv.trim().length > 0) return path.resolve(fromEnv);
  return path.join(homedir(), "Desktop", "mcp", "data");
}

async function loadLawFile(dataDir: string, id: LawId): Promise<Law | null> {
  const file = path.join(dataDir, LAW_FILE_BY_ID[id]);
  try {
    const raw = await readFile(file, "utf8");
    const json = JSON.parse(raw);
    const parsed = LawSchema.parse(json);
    if (parsed.id !== id) {
      throw new Error(
        `id mismatch in ${file}: expected "${id}", got "${parsed.id}"`,
      );
    }
    return parsed;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return null;
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to load ${file}: ${msg}`);
  }
}

export async function loadLibrary(opts: LoaderOptions = {}): Promise<LoadedLibrary> {
  const dataDir = resolveDataDir(opts);
  const laws = new Map<LawId, Law>();
  const missing: LawId[] = [];
  const errors: Array<{ law: LawId; error: string }> = [];

  for (const id of LAW_IDS) {
    try {
      const law = await loadLawFile(dataDir, id);
      if (!law) {
        missing.push(id);
      } else {
        laws.set(id, law);
      }
    } catch (err) {
      errors.push({
        law: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { dataDir, laws, missing, errors };
}

export function getLaw(lib: LoadedLibrary, id: LawId): Law | undefined {
  return lib.laws.get(id);
}

export function findArticle(
  lib: LoadedLibrary,
  lawId: LawId,
  articleNumber: string,
): Article | undefined {
  const law = lib.laws.get(lawId);
  if (!law) return undefined;
  const normalized = normalizeNumber(articleNumber);
  return law.articles.find((a) => normalizeNumber(a.number) === normalized);
}

/** Normalizes article numbers for comparison: trims, lowercases, strips "art." prefix, collapses spaces. */
export function normalizeNumber(n: string): string {
  return n
    .toLowerCase()
    .replace(/^art(í|i)culo\s+/u, "")
    .replace(/^art\.?\s*/u, "")
    .replace(/\s+/g, "")
    .trim();
}

// Needed because bundler-style path helpers aren't trivial in pure ESM; exported for tests.
export const _internal = { fileURLToPath };
