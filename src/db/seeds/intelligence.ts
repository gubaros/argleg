/**
 * Seed inicial para la capa de inteligencia: ramas del derecho, principios
 * fundamentales, doctrina representativa y placeholders para jurisprudencia.
 *
 * Esta es una primera curación, no exhaustiva. La idea es tener datos
 * representativos para cada rama core (constitucional, civil, penal,
 * administrativo) y dejar el modelo listo para crecer.
 *
 * Convenciones:
 *  - IDs son slugs estables (`derecho_civil`, `principio_buena_fe`, etc.).
 *  - Los enunciados de principios son citas/paráfrasis canónicas, no
 *    interpretación libre.
 *  - Cada principio referencia su fuente (norma + artículo, o doctrina).
 *  - La doctrina seedeada son tratados ampliamente reconocidos en Argentina.
 *  - jurisprudencia se deja vacío en este seed; es trabajo de curación
 *    independiente.
 */

export interface RamaDerechoSeed {
  id: string;
  nombre: string;
  descripcion: string;
  ambito: "publico" | "privado" | "social" | "mixto";
  es_codificada: boolean;
}

export interface PrincipioSeed {
  id: string;
  rama_id: string;
  nombre: string;
  enunciado: string;
  fuente: string;
  vigencia: "dogmatico" | "positivado" | "controvertido";
}

export interface NormaRamaSeed {
  norma_id: string;
  rama_id: string;
  relevancia: "nuclear" | "complementaria" | "tangencial";
}

export interface DoctrinaSeed {
  id: string;
  autor: string;
  obra: string;
  ano_publicacion?: number;
  rama_id?: string;
  tipo: "tratado" | "manual" | "monografia" | "articulo";
  citacion?: string;
  notas?: string;
}

export const RAMAS: readonly RamaDerechoSeed[] = [
  {
    id: "derecho_constitucional",
    nombre: "Derecho Constitucional",
    descripcion:
      "Rama del derecho público que estudia la organización del Estado, la división de poderes, los derechos fundamentales y la supremacía de la Constitución (art. 31 CN).",
    ambito: "publico",
    es_codificada: false,
  },
  {
    id: "derecho_civil",
    nombre: "Derecho Civil",
    descripcion:
      "Rama del derecho privado que regula la persona, la familia, los bienes, las obligaciones, los contratos, las sucesiones y los derechos reales. Codificada en el Código Civil y Comercial de la Nación (Ley 26.994).",
    ambito: "privado",
    es_codificada: true,
  },
  {
    id: "derecho_comercial",
    nombre: "Derecho Comercial",
    descripcion:
      "Rama del derecho privado que regula la actividad mercantil, las sociedades, los títulos de crédito y la insolvencia. Tras la unificación de 2015 muchas materias se integran al CCyC; la Ley General de Sociedades 19.550 sigue rigiendo el régimen societario.",
    ambito: "privado",
    es_codificada: true,
  },
  {
    id: "derecho_penal",
    nombre: "Derecho Penal",
    descripcion:
      "Rama del derecho público que define los delitos y sus penas. Codificado en el Código Penal (Ley 11.179). Sometido al principio de legalidad estricta (art. 18 CN).",
    ambito: "publico",
    es_codificada: true,
  },
  {
    id: "derecho_procesal",
    nombre: "Derecho Procesal",
    descripcion:
      "Rama del derecho público que regula la actuación de los tribunales y el desarrollo del proceso. Codificada por materia: CPCCN (Ley 17.454) para civil/comercial federal, CPPF (Ley 27.063) para penal federal.",
    ambito: "publico",
    es_codificada: true,
  },
  {
    id: "derecho_administrativo",
    nombre: "Derecho Administrativo",
    descripcion:
      "Rama del derecho público que regula la actividad de la administración pública: actos administrativos, contratos públicos, servicios públicos, responsabilidad estatal, procedimiento. Régimen base: Ley 19.549 (LNPA).",
    ambito: "publico",
    es_codificada: false,
  },
  {
    id: "derecho_consumidor",
    nombre: "Derecho del Consumidor",
    descripcion:
      "Rama de orden público que protege a la parte débil en relaciones de consumo. Tiene base constitucional (art. 42 CN) y se integra con la Ley 24.240 (LDC) y el CCyC.",
    ambito: "social",
    es_codificada: false,
  },
  {
    id: "derecho_proteccion_datos",
    nombre: "Derecho de Protección de Datos Personales",
    descripcion:
      "Rama emergente que regula el tratamiento de datos personales. Base constitucional: art. 43, párrafo 3 CN (habeas data). Régimen específico: Ley 25.326.",
    ambito: "publico",
    es_codificada: false,
  },
];

export const PRINCIPIOS: readonly PrincipioSeed[] = [
  // ── Constitucional ────────────────────────────────────────────────────────
  {
    id: "principio_supremacia_constitucional",
    rama_id: "derecho_constitucional",
    nombre: "Supremacía constitucional",
    enunciado:
      "La Constitución, los tratados con jerarquía constitucional y las leyes nacionales dictadas en su consecuencia son la ley suprema de la Nación.",
    fuente: "art. 31 CN",
    vigencia: "positivado",
  },
  {
    id: "principio_estado_de_derecho",
    rama_id: "derecho_constitucional",
    nombre: "Estado de derecho",
    enunciado:
      "Todos los habitantes están sometidos al imperio de la ley; el ejercicio del poder público se ejerce dentro del marco constitucional.",
    fuente: "Preámbulo CN; arts. 1, 19, 33 CN",
    vigencia: "dogmatico",
  },
  {
    id: "principio_division_de_poderes",
    rama_id: "derecho_constitucional",
    nombre: "División de poderes",
    enunciado:
      "El gobierno se divide en tres poderes —Legislativo, Ejecutivo y Judicial— que se controlan recíprocamente.",
    fuente: "arts. 1, 5, 75, 99 y 108 CN",
    vigencia: "positivado",
  },
  {
    id: "principio_jerarquia_constitucional_tratados",
    rama_id: "derecho_constitucional",
    nombre: "Jerarquía constitucional de tratados de DDHH",
    enunciado:
      "Los tratados internacionales sobre derechos humanos enumerados en el art. 75.22 CN (segundo párrafo) tienen jerarquía constitucional, no derogan ningún artículo de la primera parte y son complementarios de los derechos y garantías reconocidos.",
    fuente: "art. 75.22 CN",
    vigencia: "positivado",
  },

  // ── Civil ─────────────────────────────────────────────────────────────────
  {
    id: "principio_buena_fe",
    rama_id: "derecho_civil",
    nombre: "Buena fe",
    enunciado:
      "Los derechos deben ser ejercidos de buena fe. Este principio rige todo el ordenamiento privado y, en particular, la celebración, interpretación y ejecución de contratos.",
    fuente: "art. 9 CCyC; arts. 961 y 1061 CCyC para contratos",
    vigencia: "positivado",
  },
  {
    id: "principio_abuso_del_derecho",
    rama_id: "derecho_civil",
    nombre: "Abuso del derecho",
    enunciado:
      "La ley no ampara el ejercicio abusivo de los derechos: el que contraría los fines del ordenamiento o excede los límites de la buena fe, la moral y las buenas costumbres.",
    fuente: "art. 10 CCyC",
    vigencia: "positivado",
  },
  {
    id: "principio_pacta_sunt_servanda",
    rama_id: "derecho_civil",
    nombre: "Pacta sunt servanda",
    enunciado:
      "Los contratos válidamente celebrados son obligatorios para las partes; su contenido sólo puede ser modificado o extinguido por acuerdo de las partes o en los supuestos en que la ley lo prevé.",
    fuente: "arts. 957, 958 y 959 CCyC",
    vigencia: "positivado",
  },

  // ── Penal ─────────────────────────────────────────────────────────────────
  {
    id: "principio_legalidad_penal",
    rama_id: "derecho_penal",
    nombre: "Principio de legalidad (nullum crimen, nulla poena sine lege)",
    enunciado:
      "Ningún habitante puede ser penado sin juicio previo fundado en ley anterior al hecho del proceso. Conducta y sanción deben estar definidas por ley en sentido formal y material; no caben tipos abiertos ni analogía in malam partem.",
    fuente: "art. 18 CN; art. 9 CADH; art. 15 PIDCP",
    vigencia: "positivado",
  },
  {
    id: "principio_in_dubio_pro_reo",
    rama_id: "derecho_penal",
    nombre: "In dubio pro reo",
    enunciado:
      "En caso de duda razonable sobre los hechos constitutivos del delito o la culpabilidad del imputado, debe estarse a lo más favorable a la persona acusada.",
    fuente: "Derivado del art. 18 CN y del estado de inocencia (art. 8.2 CADH)",
    vigencia: "dogmatico",
  },
  {
    id: "principio_ne_bis_in_idem",
    rama_id: "derecho_penal",
    nombre: "Ne bis in idem",
    enunciado:
      "Nadie puede ser perseguido penalmente más de una vez por el mismo hecho.",
    fuente: "art. 8.4 CADH; doctrina judicial CSJN",
    vigencia: "dogmatico",
  },

  // ── Administrativo ────────────────────────────────────────────────────────
  {
    id: "principio_legalidad_administrativa",
    rama_id: "derecho_administrativo",
    nombre: "Legalidad administrativa",
    enunciado:
      "La administración pública sólo puede actuar dentro de las competencias atribuidas por la Constitución y las leyes. Toda actuación carente de base legal es nula.",
    fuente: "art. 19 CN; art. 7 inc. a Ley 19.549",
    vigencia: "positivado",
  },
  {
    id: "principio_motivacion_actos",
    rama_id: "derecho_administrativo",
    nombre: "Motivación de los actos administrativos",
    enunciado:
      "Todo acto administrativo debe ser motivado: expresar las razones de hecho y de derecho que lo fundan. La falta o insuficiencia de motivación es causal de nulidad.",
    fuente: "art. 7 inc. e Ley 19.549",
    vigencia: "positivado",
  },
  {
    id: "principio_razonabilidad",
    rama_id: "derecho_administrativo",
    nombre: "Razonabilidad",
    enunciado:
      "Las medidas estatales deben ser proporcionadas a los fines que persiguen. La reglamentación de derechos no puede alterar su sustancia.",
    fuente: "art. 28 CN",
    vigencia: "positivado",
  },

  // ── Consumidor ────────────────────────────────────────────────────────────
  {
    id: "principio_proteccion_consumidor",
    rama_id: "derecho_consumidor",
    nombre: "Protección del consumidor",
    enunciado:
      "Los consumidores y usuarios tienen derecho, en la relación de consumo, a la protección de su salud, seguridad e intereses económicos; a una información adecuada y veraz; a la libertad de elección y a condiciones de trato equitativo y digno.",
    fuente: "art. 42 CN; arts. 1 y 8 bis Ley 24.240",
    vigencia: "positivado",
  },
  {
    id: "principio_in_dubio_pro_consumidor",
    rama_id: "derecho_consumidor",
    nombre: "In dubio pro consumidor",
    enunciado:
      "Cuando existan dudas en la interpretación de la ley o el contrato, se debe estar a lo más favorable al consumidor.",
    fuente: "art. 3 Ley 24.240; art. 1094 CCyC",
    vigencia: "positivado",
  },

  // ── Protección de datos ───────────────────────────────────────────────────
  {
    id: "principio_habeas_data",
    rama_id: "derecho_proteccion_datos",
    nombre: "Habeas data",
    enunciado:
      "Toda persona tiene derecho a interponer acción para tomar conocimiento de los datos a ella referidos en archivos públicos o privados destinados a proveer informes y, en caso de falsedad o discriminación, exigir su supresión, rectificación, confidencialidad o actualización.",
    fuente: "art. 43, párrafo 3 CN; Ley 25.326",
    vigencia: "positivado",
  },
  {
    id: "principio_calidad_de_datos",
    rama_id: "derecho_proteccion_datos",
    nombre: "Calidad de los datos personales",
    enunciado:
      "Los datos personales deben ser ciertos, adecuados, pertinentes y no excesivos en relación al ámbito y finalidad para los que fueron recolectados.",
    fuente: "art. 4 Ley 25.326",
    vigencia: "positivado",
  },
];

export const NORMAS_POR_RAMA: readonly NormaRamaSeed[] = [
  // Constitucional
  { norma_id: "constitucion", rama_id: "derecho_constitucional", relevancia: "nuclear" },

  // Civil
  { norma_id: "ccyc", rama_id: "derecho_civil", relevancia: "nuclear" },

  // Comercial (post-unificación 2015)
  { norma_id: "ccyc", rama_id: "derecho_comercial", relevancia: "nuclear" },
  { norma_id: "ley_19550", rama_id: "derecho_comercial", relevancia: "nuclear" },

  // Penal
  { norma_id: "penal", rama_id: "derecho_penal", relevancia: "nuclear" },
  { norma_id: "constitucion", rama_id: "derecho_penal", relevancia: "complementaria" },

  // Procesal
  { norma_id: "cpccn", rama_id: "derecho_procesal", relevancia: "nuclear" },
  { norma_id: "cppf", rama_id: "derecho_procesal", relevancia: "nuclear" },

  // Administrativo
  { norma_id: "ley_19549", rama_id: "derecho_administrativo", relevancia: "nuclear" },
  { norma_id: "constitucion", rama_id: "derecho_administrativo", relevancia: "complementaria" },

  // Consumidor
  { norma_id: "ley_24240", rama_id: "derecho_consumidor", relevancia: "nuclear" },
  { norma_id: "ccyc", rama_id: "derecho_consumidor", relevancia: "complementaria" },
  { norma_id: "constitucion", rama_id: "derecho_consumidor", relevancia: "complementaria" },

  // Protección de datos
  { norma_id: "ley_25326", rama_id: "derecho_proteccion_datos", relevancia: "nuclear" },
  { norma_id: "constitucion", rama_id: "derecho_proteccion_datos", relevancia: "complementaria" },
];

export const DOCTRINA: readonly DoctrinaSeed[] = [
  // Constitucional
  {
    id: "doctrina_bidart_campos_manual",
    autor: "Bidart Campos, Germán J.",
    obra: "Manual de la Constitución Reformada",
    ano_publicacion: 1996,
    rama_id: "derecho_constitucional",
    tipo: "manual",
    citacion: "Bidart Campos, Manual de la Constitución Reformada, Ediar, 1996, 3 tomos.",
  },
  {
    id: "doctrina_sagues_elementos",
    autor: "Sagüés, Néstor P.",
    obra: "Elementos de derecho constitucional",
    ano_publicacion: 2003,
    rama_id: "derecho_constitucional",
    tipo: "tratado",
    citacion: "Sagüés, Elementos de derecho constitucional, 3ª ed., Astrea, 2003.",
  },
  // Civil
  {
    id: "doctrina_borda_tratado",
    autor: "Borda, Guillermo A.",
    obra: "Tratado de Derecho Civil",
    rama_id: "derecho_civil",
    tipo: "tratado",
    citacion: "Borda, Tratado de Derecho Civil, La Ley (varias ediciones).",
    notas: "Obra clásica anterior al CCyC; sigue siendo referencia doctrinaria.",
  },
  {
    id: "doctrina_lorenzetti_codigo",
    autor: "Lorenzetti, Ricardo Luis (dir.)",
    obra: "Código Civil y Comercial de la Nación comentado",
    ano_publicacion: 2014,
    rama_id: "derecho_civil",
    tipo: "tratado",
    citacion:
      "Lorenzetti (dir.), Código Civil y Comercial de la Nación comentado, Rubinzal-Culzoni, 2014-2015, 11 tomos.",
  },
  // Penal
  {
    id: "doctrina_zaffaroni_derecho_penal",
    autor: "Zaffaroni, Eugenio Raúl; Alagia, Alejandro; Slokar, Alejandro",
    obra: "Derecho Penal — Parte General",
    ano_publicacion: 2002,
    rama_id: "derecho_penal",
    tipo: "tratado",
    citacion: "Zaffaroni - Alagia - Slokar, Derecho Penal. Parte General, Ediar, 2ª ed., 2002.",
  },
  {
    id: "doctrina_soler_derecho_penal",
    autor: "Soler, Sebastián",
    obra: "Derecho Penal Argentino",
    rama_id: "derecho_penal",
    tipo: "tratado",
    citacion: "Soler, Derecho Penal Argentino, TEA (varias ediciones).",
  },
  // Administrativo
  {
    id: "doctrina_cassagne_derecho_administrativo",
    autor: "Cassagne, Juan Carlos",
    obra: "Derecho Administrativo",
    rama_id: "derecho_administrativo",
    tipo: "tratado",
    citacion: "Cassagne, Derecho Administrativo, LexisNexis-Abeledo Perrot (varias ediciones).",
  },
  {
    id: "doctrina_gordillo_tratado",
    autor: "Gordillo, Agustín",
    obra: "Tratado de Derecho Administrativo",
    rama_id: "derecho_administrativo",
    tipo: "tratado",
    citacion:
      "Gordillo, Tratado de Derecho Administrativo, FDA (versión libre online).",
  },
  // Procesal
  {
    id: "doctrina_palacio_procesal",
    autor: "Palacio, Lino Enrique",
    obra: "Derecho Procesal Civil",
    rama_id: "derecho_procesal",
    tipo: "tratado",
    citacion: "Palacio, Derecho Procesal Civil, Abeledo Perrot, 10 tomos.",
  },
  // Consumidor
  {
    id: "doctrina_stiglitz_consumidor",
    autor: "Stiglitz, Gabriel A.",
    obra: "Defensa del consumidor",
    rama_id: "derecho_consumidor",
    tipo: "tratado",
    citacion: "Stiglitz, Defensa del consumidor, Rubinzal-Culzoni.",
  },
];
