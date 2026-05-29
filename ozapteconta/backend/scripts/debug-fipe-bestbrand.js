/* Quem o score retorna >= 40 para "volkswagen voyage 1" e "volkswagen voyage"? */
const { phoneticNormalize, levenshtein } = require("../dist/utils/textTolerance");

function normalize(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function score(query, candidate) {
  const q = normalize(query), c = normalize(candidate);
  if (c === q) return 100;
  if (c.startsWith(q)) return 95;
  if (c.includes(q)) return 80;
  const qp = phoneticNormalize(q), cp = phoneticNormalize(c);
  if (qp && cp) {
    if (qp === cp) return 92;
    if (cp.startsWith(qp)) return 90;
    if (cp.includes(qp)) return 78;
  }
  const qT = q.split(" ").filter(Boolean), cT = c.split(" ").filter(Boolean);
  let m = 0;
  for (const qt of qT) {
    const qtp = phoneticNormalize(qt);
    if (cT.some((ct) => {
      if (ct.startsWith(qt) || qt.startsWith(ct)) return true;
      if (qt.length < 3) return false;
      const ctp = phoneticNormalize(ct);
      if (ctp.startsWith(qtp) || qtp.startsWith(ctp)) return true;
      if (qtp.length >= 4 && ctp.length >= 4) {
        const d = levenshtein(qtp, ctp);
        if (d <= 2 && d / Math.max(qtp.length, ctp.length) < 0.35) return true;
      }
      return false;
    })) m++;
  }
  return Math.round((m / Math.max(qT.length, 1)) * 70);
}

(async () => {
  const brands = await fetch("https://parallelum.com.br/fipe/api/v2/cars/brands").then((r) => r.json());
  for (const q of ["volkswagen voyage 1", "volkswagen voyage", "volkswagen voyage 6"]) {
    console.log(`\n=== q="${q}" — top brands (>=20) ===`);
    const ranked = brands
      .map((b) => ({ ...b, s: score(q, b.name) }))
      .filter((b) => b.s >= 20)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8);
    for (const r of ranked) {
      console.log(`  s=${String(r.s).padStart(3)} | ${r.name}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
