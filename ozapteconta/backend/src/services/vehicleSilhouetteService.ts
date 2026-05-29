/**
 * vehicleSilhouetteService.ts
 *
 * Resolve a silhueta (categoria visual) de um veículo consultado na FIPE.
 *
 * Fluxo de resolução:
 *   1. Lookup em `vehicle_silhouette_cache` (PostgreSQL) por (brand, model, type).
 *   2. Cache miss → classificação determinística por regex sobre o nome do modelo.
 *   3. Regra não casou → fallback genérico por tipo (apenas caminhões).
 *
 * Carros e motos: imagem fixa `ferrari-purosangue` (Ferrari Purosangue 2026, foto em assets).
 *   4. Insere no banco para reuso (UPSERT). Incrementa `hits` em cache-hits.
 *
 * Renderização: SVG → PNG via @resvg/resvg-js, com cache em RAM (10 PNGs ≈ 100 KB).
 *
 * Arquivos de silhueta: backend/assets/vehicle-silhouettes/*.svg (10 arquivos).
 */
import fs from "fs";
import path from "path";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { phoneticNormalize } from "../utils/textTolerance";

export type SilhouetteKey =
  | "ferrari-purosangue"
  | "hatch"
  | "sedan"
  | "suv"
  | "pickup"
  | "esportivo"
  | "moto-naked"
  | "moto-scooter"
  | "moto-trail"
  | "caminhao-toco"
  | "caminhao-cavalo";

/** Imagem única para todas as consultas FIPE de carros e motos. */
const FIXED_CAR_MOTO_SILHOUETTE: SilhouetteKey = "ferrari-purosangue";

export type VehicleType = "cars" | "motorcycles" | "trucks";

const SILHOUETTE_DIR = path.resolve(__dirname, "..", "..", "assets", "vehicle-silhouettes");

const ALL_KEYS: SilhouetteKey[] = [
  "ferrari-purosangue",
  "hatch", "sedan", "suv", "pickup", "esportivo",
  "moto-naked", "moto-scooter", "moto-trail",
  "caminhao-toco", "caminhao-cavalo",
];

/* ─── Cache de PNGs em RAM ──────────────────────────────────────────────────
 * PNGs são PRÉ-RENDERIZADOS no build (Windows) via @resvg/resvg-js e enviados
 * como assets estáticos para o servidor. Em runtime apenas lemos o arquivo
 * pronto — evita dependência de binário nativo (SIMD/AVX) na CPU do servidor,
 * que pode ser antiga (ex: AMD Athlon II sem AVX).
 */
const pngCache = new Map<SilhouetteKey, Buffer>();

function loadPng(key: SilhouetteKey): Buffer {
  const cached = pngCache.get(key);
  if (cached) return cached;

  const pngPath = path.join(SILHOUETTE_DIR, `${key}.png`);
  /* SANITY CHECK: arquivo PNG pré-renderizado existe no disco */
  if (!fs.existsSync(pngPath)) {
    throw new Error(`Silhueta PNG ausente: ${pngPath}`);
  }
  const png = fs.readFileSync(pngPath);
  pngCache.set(key, png);
  return png;
}

/* ─── Slug helpers ───────────────────────────────────────────────────────── */
function slugify(input: string): string {
  return phoneticNormalize(
    String(input || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).replace(/\s+/g, "-").slice(0, 100);
}

/* ─── Regras determinísticas por nome de modelo ──────────────────────────── */

/**
 * Heurísticas por nome de modelo (após normalização + remoção de acentos).
 * Ordem importa: a primeira que casar vence.
 */
const CAR_RULES: Array<{ key: SilhouetteKey; tokens: RegExp }> = [
  /* Pickups primeiro (palavras-chave inequívocas) */
  {
    key: "pickup",
    tokens:
      /\b(hilux|ranger|s10|amarok|strada|toro|saveiro|montana|maverick|frontier|l200|triton|gladiator|dakota|f250|f350|rampage|tornado|courier)\b/,
  },
  /* Hatch — modelos populares brasileiros e chineses
   * NOTA: este regex é testado tanto contra a string original quanto contra a
   * forma fonética (`ph→f`, `k→c`, `y→i`, `w→v`, duplicadas reduzidas).
   * Por isso `dolphin` aparece como `dolfin`, `kwid` como `cvid`, etc. */
  {
    key: "hatch",
    tokens:
      /\b(gol|polo|fox|up|fiesta|ka|onix|celta|prisma hatch|hb20|hb 20|mobi|argo|punto|palio|uno|brava hatch|march|tida|sentra hatch|yaris hatch|etios hatch|sandero|kwid|cvid|clio|stilo|i30|veloster hatch|c3|208|207|206|new fiesta|fiesta hatch|focus hatch|cruze hatch|hb20 hatch|hb20s hatch|hb 20s|astra|vectra hatch|fit|jazz|civic hatch|leaf hatch|gol bola|gol rallye|gol gti|gol track|gol special|gol comfortline|gol highline|polo hatch|new polo|fox highline|fox extreme|up tsi|up move|up cross|panda|cinquecento|500|fiat 500|abarth|aygo|c1|107|smart|forfour|fortwo|brio|hb20 ev|dolphin|dolfin|seal hatch|atto 3|seagull|han hatch|chery tiggo 2|tiggo 2|qq|qq3|onix hatch|onix joy|onix turbo|onix premier|onix activ|onix lt|onix ltz)\b/,
  },
  /* SUV / crossover */
  {
    key: "suv",
    tokens:
      /\b(suv|crossover|hr v|hrv|hr-v|wr v|wrv|wr-v|tracker|trailblazer|equinox|compass|renegade|commander|wrangler|cherokee|grand cherokee|t cross|tcross|t-cross|nivus|taos|tiguan|touareg|q3|q5|q7|q8|x1|x3|x5|x6|gle|glc|gla|gle|kicks|kuga|territory|ecosport|bronco|edge|explorer|outback|forester|crv|cr v|cr-v|hr v|rav4|sw4|fortuner|hilux sw4|cayenne|macan|range rover|discovery|defender|evoque|velar|jimny|vitara|grand vitara|s cross|jolion|haval|3008|5008|2008|c4 cactus|c4 picasso|c4 aircross|c5 aircross|berlingo|partner|argo trekking|trekking|envision|enclave|tugela|saint|seltos|sorento|sportage|carnival|stonic|niro|soul|ev6|telluride|palisade|tucson|santa fe|creta|hb20s cross|hb20 cross|i30 cross|veloster|kona|nexo|ix35|santa fe|grand santa fe|equator|dolphin|song|seal|han|atto|byd|frv|gs5|gs7|gs8|m4|gv70|gv80|m vision|t8|cherokee|liberty|new compass|new renegade|gx7|gx5|tiguan allspace|sw7|nx|nx450h|rx|rx450h|rx450hl|gx|lx|ux|model y|model x|jolion|h6|coolray|atlas|tugela|grand emgrand|emgrand|grand siena cross|rava|raptor|x35|x55|x70|x90|x95|gs8|gs7|defender|wagoneer|grand wagoneer|grandland|q2|q4 e tron|q6 e tron|x55 plus|x90 plus|tugela|s60 cross|cross country|xc40|xc60|xc70|xc90)\b/,
  },
  /* Esportivos */
  {
    key: "esportivo",
    tokens:
      /\b(huracan|aventador|gallardo|murcielago|urus|488|f8|sf90|portofino|roma|812|gtb|spider|gtc4|296|m4|m3|m5|m6|m8|amg|amg gt|gt r|gt s|gt c|cayman|boxster|911|gt3|gt2|gt4|718|carrera|panamera|taycan|nsx|gtr|gt r|skyline|supra|brz|gr|gr corolla|rs3|rs4|rs5|rs6|rs7|s3|s4|s5|s6|s7|s8|tt|r8|continental|gt continental|dbs|db11|db12|vantage|valkyrie|valhalla|huayra|zonda|chiron|veyron|enzo|laferrari|maserati gt|granturismo|grancabrio|levante|mc20|stradale|tributo|monza|360|550|575|612|599|458|f12|gt|i8|m roadster|elise|exige|evora|emira|esprit|stratos|f type|jaguar f|paramera|maserati|c63|e63|s63|c63s|e63s|cls 63|sl|sls|gt63|gt53|g63|c43|e43|e53|c53|nismo|gtr nismo|brz ts)\b/,
  },
  /* Sedans */
  {
    key: "sedan",
    tokens:
      /\b(sedan|cronos|virtus|voyage|polo sedan|onix plus|onix sedan|corsa sedan|prisma|cobalt|cruze|civic|city|accord|fit sedan|grand siena|siena|linea|fluence|logan|sandero sedan|sentra|versa|altima|maxima|sentra fe|tida sedan|mazda 3 sedan|mazda 6|camry|corolla|corolla altis|corolla cross|corolla xei|corolla xli|etios sedan|yaris sedan|hb20s|hb20 s|hb20s premium|elantra|sonata|i30 sedan|accent|azera|genesis|focus sedan|fiesta sedan|fusion|c4 pallas|c4 lounge|c4 sedan|c5|c6|berlina|408|508|307 sedan|elysee|c elysee|peugeot 408|brava|marea|tempra|c30|s40|s60|s80|s90|jetta|passat|new passat|vento|polo class|bora|santana|gol sedan|fox sedan|polo sedan|fusca sedan|new fusca|new beetle|gli|a4|a3 sedan|a5 sedan|a6|a7|a8|q2 sedan|118i|320i|328i|330i|335i|420i|428i|520i|528i|530i|540i|550i|620i|630i|640i|650i|730i|740i|750i|m340i|m440i|m550i|m760i|c180|c200|c220|c250|c300|c350|c400|c450|c63|e200|e220|e240|e250|e300|e320|e350|e400|e450|s320|s400|s500|s550|s600|cla 200|cla 250|cls 250|cls 350|cls 400|cls 500|gla|glc 250|glc 300|glc 400|glc 450|gle 350|gle 400|gle 450|gle 500|prius|insight|leaf sedan|hilux sedan|civic sedan)\b/,
  },
];

const MOTO_RULES: Array<{ key: SilhouetteKey; tokens: RegExp }> = [
  /* Scooters */
  {
    key: "moto-scooter",
    tokens:
      /\b(scooter|biz|pop|elite|pcx|sh\s*\d|forza|nmax|burgman|tmax|gts|gtv|s2|s3|liberty|fly|primavera|sprint|medley|beverly|piaggio|metropolis|400x scooter|350x scooter|n max|nmax 160|c\s*125|c125|cb 125|c100|c110)\b/,
  },
  /* Trail / off-road / adventure */
  {
    key: "moto-trail",
    tokens:
      /\b(trail|xre|nxr|bros|crf|xr|xr 250|xtz|tenere|africa twin|f 750 gs|f 800 gs|f 850 gs|r 1200 gs|r 1250 gs|adventure|himalayan|gsx s 1000|v strom|dr|sertao|crosser|lander|dual sport|enduro|wr|cr|cr 250|drz|klx|klr|rmz|crf 250 f|crf 250 rally|crf 1100|ducati multistrada|multistrada|tiger|tracer|fz 25|fz25|fz25 adventure|himalayan|scrambler|desert sled|big trail)\b/,
  },
];

const TRUCK_RULES: Array<{ key: SilhouetteKey; tokens: RegExp }> = [
  /* Cavalo mecânico / carreta / extrapesado */
  {
    key: "caminhao-cavalo",
    tokens:
      /\b(cavalo|fh|fm|fmx|nh|stralis|hi way|hi road|t cross |s cross |actros|axor|atego|6x2|6x4|8x2|8x4|carreta|bitrem|rodotrem|extrapesado|extra pesado|topline|stralis hi|fh 460|fh 540|fh 500|fh 480|fh 440|fh 420|fh 400|fh 380|r 450|r 500|r 540|r 560|r 620|s 500|s 540|s 620|tgx|tgs|hi land|hi street|hi pro|hi cab|premium|magnum|kerax|range t|range c|range d|tractor|trator|cargo 2422|cargo 2842|cargo 3133|cargo 4030|cargo 4031|cargo 4532)\b/,
  },
];

function applyRules(
  rules: Array<{ key: SilhouetteKey; tokens: RegExp }>,
  normalized: string,
  phonetic: string,
): SilhouetteKey | null {
  for (const rule of rules) {
    if (rule.tokens.test(normalized)) return rule.key;
    if (phonetic !== normalized && rule.tokens.test(phonetic)) return rule.key;
  }
  return null;
}

/**
 * Classifica o nome do modelo em uma SilhouetteKey por regras determinísticas.
 * Cada regex é testado contra a forma ASCII original E contra a forma fonética
 * (`ph→f`, `k→c`, `y→i`, `w→v`, duplicadas reduzidas), o que evita manter
 * listas duplas de marcas. Retorna null se nenhuma regra casar.
 */
function classifyByRules(modelName: string, vehicleType: VehicleType): SilhouetteKey | null {
  const normalized = modelName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const phonetic = phoneticNormalize(normalized);

  if (vehicleType === "motorcycles") {
    return applyRules(MOTO_RULES, normalized, phonetic) ?? "moto-naked";
  }
  if (vehicleType === "trucks") {
    return applyRules(TRUCK_RULES, normalized, phonetic) ?? "caminhao-toco";
  }
  return applyRules(CAR_RULES, normalized, phonetic);
}

/** Fallback genérico por tipo de veículo quando nada casou. */
function fallbackByType(vehicleType: VehicleType): SilhouetteKey {
  if (vehicleType === "motorcycles") return "moto-naked";
  if (vehicleType === "trucks") return "caminhao-toco";
  return "sedan";
}

/* ─── API pública ────────────────────────────────────────────────────────── */

export interface SilhouetteResolution {
  key: SilhouetteKey;
  source: "cache" | "rule" | "fallback" | "manual";
  hits: number;
}

/**
 * Resolve a silhueta para um veículo, com cache no banco.
 * Nunca lança: em caso de falha de banco, segue com classificação em memória.
 */
export async function resolveSilhouette(
  brandName: string,
  modelName: string,
  vehicleType: VehicleType,
): Promise<SilhouetteResolution> {
  /* Carros e motos: sempre a mesma silhueta (Ferrari Purosangue). */
  if (vehicleType === "cars" || vehicleType === "motorcycles") {
    return { key: FIXED_CAR_MOTO_SILHOUETTE, source: "manual", hits: 0 };
  }

  const brandSlug = slugify(brandName);
  const modelSlug = slugify(modelName);

  /* SANITY CHECK: slugs vazios indicam input ruim → usa fallback direto, sem DB */
  if (!brandSlug || !modelSlug) {
    return { key: fallbackByType(vehicleType), source: "fallback", hits: 0 };
  }

  /* 1. Cache no banco */
  try {
    const cached = await prisma.vehicleSilhouetteCache.findUnique({
      where: { brandSlug_modelSlug_vehicleType: { brandSlug, modelSlug, vehicleType } },
    });
    if (cached) {
      /* Best-effort update (não bloqueia o retorno) */
      prisma.vehicleSilhouetteCache
        .update({
          where: { id: cached.id },
          data: { hits: { increment: 1 }, lastUsedAt: new Date() },
        })
        .catch((err) => logger.warn("[silhouette] update hits falhou", err));

      return {
        key: cached.silhouetteKey as SilhouetteKey,
        source: cached.source === "manual" ? "manual" : "cache",
        hits: cached.hits + 1,
      };
    }
  } catch (err) {
    logger.warn("[silhouette] consulta cache falhou, prosseguindo sem persistir", err);
  }

  /* 2. Classificação por regras */
  const ruleKey = classifyByRules(modelName, vehicleType);
  const finalKey: SilhouetteKey = ruleKey ?? fallbackByType(vehicleType);
  const finalSource = ruleKey ? "rule" : "fallback";

  /* 3. Persiste (UPSERT) — não interrompe o fluxo se falhar. */
  try {
    await prisma.vehicleSilhouetteCache.upsert({
      where: { brandSlug_modelSlug_vehicleType: { brandSlug, modelSlug, vehicleType } },
      create: {
        brandSlug,
        modelSlug,
        vehicleType,
        silhouetteKey: finalKey,
        source: finalSource,
        hits: 1,
      },
      update: { hits: { increment: 1 }, lastUsedAt: new Date() },
    });
  } catch (err) {
    logger.warn("[silhouette] upsert falhou — sem persistência desta vez", err);
  }

  return { key: finalKey, source: finalSource, hits: 1 };
}

/**
 * Renderiza o PNG correspondente à silhueta (cache em RAM).
 * Retorna null se a chave for inválida ou o arquivo SVG não estiver presente.
 */
export function getSilhouettePng(key: SilhouetteKey): Buffer | null {
  /* SANITY CHECK: chave conhecida */
  if (!ALL_KEYS.includes(key)) return null;
  try {
    return loadPng(key);
  } catch (err) {
    logger.warn(`[silhouette] falha ao renderizar ${key}`, err);
    return null;
  }
}

/** Pré-aquece o cache de PNGs em RAM (chamável no boot). */
export function warmupSilhouetteCache(): void {
  for (const key of ALL_KEYS) {
    try {
      loadPng(key);
    } catch (err) {
      logger.warn(`[silhouette] warmup falhou para ${key}`, err);
    }
  }
  logger.info(`[silhouette] cache aquecido: ${pngCache.size}/${ALL_KEYS.length} silhuetas`);
}
