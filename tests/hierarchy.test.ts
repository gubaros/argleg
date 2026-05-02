import { describe, it, expect } from "vitest";
import {
  ALL_LEGAL_TIERS,
  ALL_STRUCTURAL_LEVELS,
  LegalTierSchema,
  PROVINCIAS,
  TIER_BY_NORMA_ID,
  TIER_PROFILES,
  findIncoherentLevels,
  tiersByAmbito,
  verifyTierAgainstText,
  type LegalTier,
} from "../src/laws/hierarchy.js";

describe("hierarchy: data integrity", () => {
  it("ALL_LEGAL_TIERS lists every tier with a profile, no extras", () => {
    const profileKeys = Object.keys(TIER_PROFILES) as LegalTier[];
    expect([...ALL_LEGAL_TIERS].sort()).toEqual([...profileKeys].sort());
  });

  it("each TierProfile.tier matches its registry key", () => {
    for (const [key, profile] of Object.entries(TIER_PROFILES)) {
      expect(profile.tier).toBe(key);
    }
  });

  it("niveles_tipicos is a subset of niveles_posibles for every tier", () => {
    for (const [tier, profile] of Object.entries(TIER_PROFILES)) {
      const posibles = new Set(profile.niveles_posibles);
      const violators = profile.niveles_tipicos.filter((l) => !posibles.has(l));
      expect(violators, `tier ${tier} has tipicos outside posibles: ${violators.join(",")}`).toEqual([]);
    }
  });

  it("every TierProfile has positive jerarquia_kelsen and known ambito", () => {
    const ambitosValidos = new Set(["federal", "provincial", "municipal"]);
    for (const profile of Object.values(TIER_PROFILES)) {
      expect(profile.jerarquia_kelsen).toBeGreaterThan(0);
      expect(ambitosValidos.has(profile.ambito)).toBe(true);
    }
  });

  it("ALL_STRUCTURAL_LEVELS covers every level used in any TierProfile", () => {
    const known = new Set(ALL_STRUCTURAL_LEVELS);
    for (const profile of Object.values(TIER_PROFILES)) {
      for (const lvl of profile.niveles_posibles) {
        expect(known.has(lvl), `unknown level ${lvl} in ${profile.tier}`).toBe(true);
      }
    }
  });

  it("LegalTierSchema accepts every value in ALL_LEGAL_TIERS", () => {
    for (const tier of ALL_LEGAL_TIERS) {
      expect(() => LegalTierSchema.parse(tier)).not.toThrow();
    }
  });

  it("LegalTierSchema rejects unknown values", () => {
    expect(() => LegalTierSchema.parse("ley_imaginaria")).toThrow();
  });
});

describe("hierarchy: provincias catalogue", () => {
  it("declares all 23 provinces plus CABA (24 jurisdictions)", () => {
    expect(PROVINCIAS).toHaveLength(24);
  });

  it("every provincia.norma_id exists in TIER_BY_NORMA_ID and points to its declared tier", () => {
    for (const p of PROVINCIAS) {
      expect(TIER_BY_NORMA_ID[p.norma_id], `missing tier for ${p.norma_id}`).toBe(p.tier);
    }
  });

  it("CABA is mapped to the constitucion_caba tier (not provincial)", () => {
    const caba = PROVINCIAS.find((p) => p.id === "caba");
    expect(caba).toBeDefined();
    expect(caba!.tier).toBe("constitucion_caba");
  });

  it("the 23 provinces (excluding CABA) all map to constitucion_provincial", () => {
    const provincesOnly = PROVINCIAS.filter((p) => p.id !== "caba");
    expect(provincesOnly).toHaveLength(23);
    for (const p of provincesOnly) {
      expect(p.tier).toBe("constitucion_provincial");
    }
  });

  it("provincia ids are unique", () => {
    const ids = PROVINCIAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("hierarchy: corpus mapping", () => {
  const CORPUS = [
    "constitucion",
    "ccyc",
    "penal",
    "cppf",
    "cpccn",
    "ley_24240",
    "ley_19550",
    "ley_19549",
    "ley_25326",
  ];

  it("every law in the current corpus is mapped to a tier", () => {
    for (const id of CORPUS) {
      expect(TIER_BY_NORMA_ID[id], `missing tier for ${id}`).toBeDefined();
    }
  });

  it("every TIER_BY_NORMA_ID value points to a real tier profile", () => {
    for (const [normaId, tier] of Object.entries(TIER_BY_NORMA_ID)) {
      expect(TIER_PROFILES[tier], `tier ${tier} for ${normaId} has no profile`).toBeDefined();
    }
  });

  it("constitucion is constitucion_nacional", () => {
    expect(TIER_BY_NORMA_ID.constitucion).toBe("constitucion_nacional");
  });

  it("CCyC and Penal are codigo_fondo", () => {
    expect(TIER_BY_NORMA_ID.ccyc).toBe("codigo_fondo");
    expect(TIER_BY_NORMA_ID.penal).toBe("codigo_fondo");
  });

  it("CPCCN and CPPF are codigo_procesal_federal", () => {
    expect(TIER_BY_NORMA_ID.cpccn).toBe("codigo_procesal_federal");
    expect(TIER_BY_NORMA_ID.cppf).toBe("codigo_procesal_federal");
  });

  it("the four leyes ordinarias are ley_federal", () => {
    expect(TIER_BY_NORMA_ID.ley_24240).toBe("ley_federal");
    expect(TIER_BY_NORMA_ID.ley_19549).toBe("ley_federal");
    expect(TIER_BY_NORMA_ID.ley_19550).toBe("ley_federal");
    expect(TIER_BY_NORMA_ID.ley_25326).toBe("ley_federal");
  });
});

describe("hierarchy: verifyTierAgainstText", () => {
  it("matches the constitution by its preamble", () => {
    const text = "PREÁMBULO\n\nNos los representantes del pueblo de la Nación Argentina...";
    const result = verifyTierAgainstText("constitucion_nacional", text);
    expect(result.matched).toBe(true);
    expect(result.matchedPatterns).toBeGreaterThan(0);
  });

  it("matches a codigo_fondo by its Libro Primero header", () => {
    const text = "LIBRO PRIMERO - PARTE GENERAL\n\nTÍTULO PRELIMINAR";
    const result = verifyTierAgainstText("codigo_fondo", text);
    expect(result.matched).toBe(true);
    expect(result.matchedPatterns).toBeGreaterThanOrEqual(2);
  });

  it("matches a codigo_procesal_federal by its specific marker", () => {
    const text = "Código Procesal Penal Federal\nLIBRO PRIMERO";
    const result = verifyTierAgainstText("codigo_procesal_federal", text);
    expect(result.matched).toBe(true);
  });

  it("matches a ley_federal by its number header", () => {
    const text = "Ley N° 25.326\n\nProtección de los Datos Personales";
    const result = verifyTierAgainstText("ley_federal", text);
    expect(result.matched).toBe(true);
  });

  it("returns matched=false when the declared tier is wrong", () => {
    // A pure ley text presented as if it were a codigo_fondo
    const text = "Ley N° 24.240 - Defensa del Consumidor\nCAPÍTULO I";
    const result = verifyTierAgainstText("codigo_fondo", text);
    expect(result.matchedPatterns).toBe(0);
    expect(result.matched).toBe(false);
  });

  it("returns matched=true with zero patterns when the tier defines none", () => {
    // tratado_constitucional and tratado_internacional define no patterns.
    const result = verifyTierAgainstText("tratado_constitucional", "any text");
    expect(result.matched).toBe(true);
    expect(result.totalPatterns).toBe(0);
  });
});

describe("hierarchy: findIncoherentLevels", () => {
  it("returns empty when all detected levels are allowed", () => {
    const violators = findIncoherentLevels("ley_federal", ["titulo", "capitulo", "articulo"]);
    expect(violators).toEqual([]);
  });

  it("flags a level that is not allowed for the tier", () => {
    // ley_federal does NOT allow 'libro' (only codigos do).
    const violators = findIncoherentLevels("ley_federal", ["libro", "articulo"]);
    expect(violators).toEqual(["libro"]);
  });

  it("accepts a full legitimate hierarchy in codigo_fondo", () => {
    const violators = findIncoherentLevels("codigo_fondo", [
      "libro",
      "titulo",
      "capitulo",
      "seccion",
      "articulo",
    ]);
    expect(violators).toEqual([]);
  });
});

describe("hierarchy: tiersByAmbito", () => {
  it("returns federal tiers ordered by jerarquia ascending", () => {
    const tiers = tiersByAmbito("federal");
    expect(tiers.length).toBeGreaterThan(0);
    expect(tiers[0]!.jerarquia_kelsen).toBeLessThanOrEqual(tiers[tiers.length - 1]!.jerarquia_kelsen);
    // top of the federal pyramid is the constitution
    expect(tiers[0]!.tier).toBe("constitucion_nacional");
  });

  it("returns provincial-and-CABA tiers ordered by jerarquía", () => {
    const tiers = tiersByAmbito("provincial");
    expect(tiers.map((t) => t.tier)).toEqual([
      "constitucion_provincial",
      "constitucion_caba",
      "ley_provincial",
      "decreto_provincial",
    ]);
  });

  it("returns municipal tiers", () => {
    const tiers = tiersByAmbito("municipal");
    expect(tiers.map((t) => t.tier)).toEqual(["ordenanza_municipal"]);
  });
});
