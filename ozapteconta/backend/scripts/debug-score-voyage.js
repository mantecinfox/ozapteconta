const { phoneticNormalize, levenshtein } = require("../dist/utils/textTolerance");

function normalize(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function explainHit(qt, cTokens) {
  const qtp = phoneticNormalize(qt);
  for (const ct of cTokens) {
    const ctp = phoneticNormalize(ct);
    if (ct.startsWith(qt) || qt.startsWith(ct)) {
      return `${qt} ~ ${ct} (prefix-norm)`;
    }
    if (qt.length < 3) continue;
    if (ctp.startsWith(qtp) || qtp.startsWith(ctp)) {
      return `${qt}(${qtp}) ~ ${ct}(${ctp}) (prefix-phonetic)`;
    }
    if (qtp.length >= 4 && ctp.length >= 4) {
      const d = levenshtein(qtp, ctp);
      const maxLen = Math.max(qtp.length, ctp.length);
      if (d <= 2 && d / maxLen < 0.35) {
        return `${qt}(${qtp}) ~ ${ct}(${ctp}) lev=${d}`;
      }
    }
  }
  return null;
}

function score(query, candidate) {
  const q = normalize(query), c = normalize(candidate);
  const qT = q.split(" ").filter(Boolean);
  const cT = c.split(" ").filter(Boolean);
  let matched = 0;
  for (const qt of qT) {
    const why = explainHit(qt, cT);
    console.log(`  token "${qt}" -> ${why || "NO MATCH"}`);
    if (why) matched++;
  }
  return { matched, total: qT.length };
}

for (const q of ["volkswagen voyage", "volkswagen voyage 1", "volkswagen voyage 6"]) {
  console.log(`\n--- q="${q}" vs "VW - VolksWagen" ---`);
  const r = score(q, "VW - VolksWagen");
  console.log(`  RESULT: ${r.matched}/${r.total}`);
}
