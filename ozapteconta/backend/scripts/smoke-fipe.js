/* Casos críticos: marcas em qualquer posição, modelos com sub-versão e ano. */
require("dotenv").config();
const { detectFipeQuery, queryFipe } = require("../dist/services/fipeService");

const cases = [
  "FIPE Volkswagen Voyage 1.6 2020",
  "fipe voyage 1.6 volkswagen 2020",
  "FIPE volkswagen voyage 2020",
  "fipe gol 1.0 2021",
  "fipe wolksvagen gol 2021",
  "fipe honda civic 2020",
  "fipe toyota hilux 2021",
  "fipe byd dolphin 2024",
  "fipe moto honda cg 160 2022",
];

(async () => {
  for (const t of cases) {
    const det = detectFipeQuery(t);
    if (!det) { console.log(`[skip] no detect: ${t}`); continue; }
    const r = await queryFipe("smk", det.query, det.vehicleType);
    const head = (r.message || "").split("\n").slice(0, 5).join(" | ");
    console.log(`\n>> ${t}`);
    console.log(`   brand=${r.brandName} | model=${r.modelName}`);
    console.log(`   ${head}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
