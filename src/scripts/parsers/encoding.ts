/**
 * InfoLEG character-encoding helpers.
 *
 * InfoLEG actually serves CP1252 (Windows-1252), not strict ISO-8859-1.
 * The difference matters: bytes 0x80-0x9F encode typographic chars (— – ' '
 * “ ” … etc.) in CP1252 but map to invisible control codepoints in Latin-1.
 * Node's `TextDecoder("windows-1252")` has a known limitation where it
 * leaves those bytes as `U+0080..U+009F` instead of mapping them to the
 * CP1252 typographic chars, so we map them manually here.
 */

const CP1252_HIGH: Record<number, string> = {
  0x80: "€",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8e: "Ž",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9e: "ž",
  0x9f: "Ÿ",
};

/** Decode a Buffer using the full Windows-1252 mapping. */
export function decodeCp1252(buf: Buffer): string {
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

/**
 * Heuristic for "this UTF-8 decode looks broken — fall back to CP1252".
 * UTF-8 decoding of CP1252-encoded text produces a flurry of replacement
 * chars (U+FFFD, displayed as "�"); 10+ in a single document is a strong
 * signal we picked the wrong codec.
 */
export function looksMojibake(s: string): boolean {
  const replacements = (s.match(/�/g) ?? []).length;
  return replacements > 10;
}

/**
 * One-shot decoder for InfoLEG bytes: try UTF-8 first, fall back to CP1252
 * when mojibake is detected. Use this for any HTML downloaded from InfoLEG.
 */
export function decodeInfoleg(buf: Buffer): string {
  const utf8 = buf.toString("utf8");
  return looksMojibake(utf8) ? decodeCp1252(buf) : utf8;
}
