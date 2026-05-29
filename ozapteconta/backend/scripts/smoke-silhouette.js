/* Smoke test: resolve silhuetas reais para os modelos que falharam. */
require("dotenv").config();
const sil = require("../dist/services/vehicleSilhouetteService");

(async () => {
  sil.warmupSilhouetteCache();
  const cases = [
    ["Volkswagen", "Voyage 1.6", "cars"],
    ["Volkswagen", "Gol 1.0", "cars"],
    ["Honda", "Civic", "cars"],
    ["Toyota", "Hilux SR", "cars"],
    ["BYD", "Dolphin", "cars"],
    ["Honda", "CG 160 Fan", "motorcycles"],
  ];
  for (const [brand, model, type] of cases) {
    const r = await sil.resolveSilhouette(brand, model, type);
    const png = sil.getSilhouettePng(r.key);
    const len = png ? png.length : 0;
    console.log(
      `[OK] ${brand} ${model} (${type}) -> ${r.key} src=${r.source} png=${len}B`
    );
    if (!png) {
      console.error(`[FAIL] png nulo para ${r.key}`);
      process.exit(1);
    }
  }
  console.log("[DONE] smoke-silhouette OK");
})().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
