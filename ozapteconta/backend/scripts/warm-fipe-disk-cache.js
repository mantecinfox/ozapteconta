/**
 * Popula data/fipe-disk-cache a partir da API Parallelum.
 * Uso: node scripts/warm-fipe-disk-cache.js
 * (rodar quando a API não estiver em 429)
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const BASE = "https://fipe.parallelum.com.br/api/v2";
const OUT = path.resolve(__dirname, "..", "data", "fipe-disk-cache");

function key(apiPath) {
  return apiPath.replace(/^\//, "").replace(/\//g, "__") + ".json";
}

async function fetchJson(apiPath) {
  const res = await fetch(`${BASE}${apiPath}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${apiPath}`);
  return res.json();
}

async function save(apiPath, payload) {
  fs.mkdirSync(OUT, { recursive: true });
  const filePath = path.join(OUT, key(apiPath));
  fs.writeFileSync(filePath, JSON.stringify({ savedAt: Date.now(), payload }), "utf8");
  console.log("saved", apiPath);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  for (const type of ["cars", "motorcycles", "trucks"]) {
    const brandsPath = `/${type}/brands`;
    const brands = await fetchJson(brandsPath);
    await save(brandsPath, brands);
    await sleep(1500);
  }

  const carsBrands = JSON.parse(
    fs.readFileSync(path.join(OUT, key("/cars/brands")), "utf8"),
  ).payload;
  const vw = carsBrands.find((b) => /volks/i.test(b.name));
  if (vw) {
    const modelsPath = `/cars/brands/${vw.code}/models`;
    const models = await fetchJson(modelsPath);
    await save(modelsPath, models);
    await sleep(1500);

    const modelsList = Array.isArray(models) ? models : models.models ?? [];
    const voyage = modelsList.find((m) => /voyage 1\.6 msi flex 8v 4p$/i.test(m.name));
    if (voyage) {
      const yearsPath = `/cars/brands/${vw.code}/models/${voyage.code}/years`;
      const years = await fetchJson(yearsPath);
      await save(yearsPath, years);
      const y2020 = years.find((y) => y.name.includes("2020"));
      if (y2020) {
        const pricePath = `/cars/brands/${vw.code}/models/${voyage.code}/years/${y2020.code}`;
        const price = await fetchJson(pricePath);
        await save(pricePath, price);
      }
    }
  }

  console.log("DONE warm-fipe-disk-cache");
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
