/* Reproduz, fora do server, a busca por "voyage 1 6" sobre a lista real de
 * modelos VW na API FIPE. Mostra top-15 do score atual e diagnostica o bug. */
const { phoneticNormalize, levenshtein } = require("../dist/utils/textTolerance");

const FIPE_BASE = "https://parallelum.com.br/fipe/api/v2";

function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function score(query, candidate) {
  const q = normalize(query);
  const c = normalize(candidate);
  if (c === q) return 100;
  if (c.startsWith(q)) return 95;
  if (c.includes(q)) return 80;
  const qp = phoneticNormalize(q);
  const cp = phoneticNormalize(c);
  if (qp && cp) {
    if (qp === cp) return 92;
    if (cp.startsWith(qp)) return 90;
    if (cp.includes(qp)) return 78;
  }
  const qTokens = q.split(" ").filter(Boolean);
  const cTokens = c.split(" ").filter(Boolean);
  let matched = 0;
  for (const qt of qTokens) {
    const qtp = phoneticNormalize(qt);
    const hit = cTokens.some((ct) => {
      if (ct.startsWith(qt) || qt.startsWith(ct)) return true;
      if (qt.length < 3) return false;
      const ctp = phoneticNormalize(ct);
      if (ctp.startsWith(qtp) || qtp.startsWith(ctp)) return true;
      if (qtp.length >= 4 && ctp.length >= 4) {
        const dist = levenshtein(qtp, ctp);
        const maxLen = Math.max(qtp.length, ctp.length);
        if (dist <= 2 && dist / maxLen < 0.35) return true;
      }
      return false;
    });
    if (hit) matched++;
  }
  const ratio = qTokens.length > 0 ? matched / qTokens.length : 0;
  return Math.round(ratio * 70);
}

(async () => {
  const brands = await fetch(`${FIPE_BASE}/cars/brands`).then((r) => r.json());
  const vw = brands.find((b) => /volks/i.test(b.name));
  console.log("VW brand:", vw);

  const modelsResp = await fetch(`${FIPE_BASE}/cars/brands/${vw.code}/models`).then((r) => r.json());
  const models = Array.isArray(modelsResp) ? modelsResp : modelsResp.models ?? [];
  console.log("Total modelos VW:", models.length);

  const queries = ["voyage 1 6", "voyage 1.6", "voyage"];
  for (const q of queries) {
    console.log(`\n=== query: "${q}" ===`);
    const ranked = models
      .map((m) => ({ ...m, s: score(q, m.name) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 15);
    for (const r of ranked) {
      console.log(`  ${String(r.s).padStart(3)} | ${r.name}`);
    }
  }

  console.log("\n=== modelos contendo 'voyage' ===");
  const voyages = models.filter((m) => /voyage/i.test(m.name));
  console.log("Encontrados:", voyages.length);
  for (const v of voyages.slice(0, 8)) {
    console.log(`  ${v.code} | ${v.name} | score("voyage 1 6")=${score("voyage 1 6", v.name)}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
