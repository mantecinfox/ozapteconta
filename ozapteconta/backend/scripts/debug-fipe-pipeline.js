/* Pipeline real (detectFipeQuery + queryFipe) com o input que travou. */
require("dotenv").config();
const fs = require("fs");
const path = require("path");

/* Instrumenta o módulo: injeta logs em pontos chaves. */
const svcPath = path.resolve(__dirname, "../dist/services/fipeService.js");
let src = fs.readFileSync(svcPath, "utf8");
if (!src.includes("__DBG_FIPE__")) {
  // Patcha pra logar foundBrand, modelQuery, foundModelRaw
  src = src.replace(
    "if (!foundBrand) {",
    "console.log('__DBG_FIPE__ before-fallback: tokens=', tokens, 'queryWithoutYear=', queryWithoutYear, 'foundBrand=', foundBrand && foundBrand.name, 'modelQuery=', modelQuery);\n        if (!foundBrand) {"
  );
  src = src.replace(
    "for (let n = Math.min(tokens.length, 3); n >= 1; n--) {",
    "for (let n = Math.min(tokens.length, 3); n >= 1; n--) { console.log('__DBG_FIPE_LOOP__ n=', n, 'cand=', tokens.slice(0, n).join(' '));"
  );
  src = src.replace(
    "if (match && score(brandCandidate, match.name) >= 40) {",
    "const __dbgS = match ? score(brandCandidate, match.name) : -1; console.log('__DBG_FIPE_LOOP__ matched=', match && match.name, 'score=', __dbgS); if (match && __dbgS >= 40) {"
  );
  src = src.replace(
    "const models = await getModels(type, foundBrand.code);",
    "console.log('__DBG_FIPE__ brand-resolved:', foundBrand && foundBrand.name, '| modelQuery=', JSON.stringify(modelQuery));\n        const models = await getModels(type, foundBrand.code);"
  );
  src = src.replace(
    "let foundModelRaw = modelQuery",
    "console.log('__DBG_FIPE__ models-count=', models.length); let foundModelRaw = modelQuery"
  );
  src = src.replace(
    "if (modelQuery && requestedYear) {",
    "console.log('__DBG_FIPE__ bestMatch foundModelRaw=', foundModelRaw && foundModelRaw.name);\n        if (modelQuery && requestedYear) {"
  );
  src = src.replace(
    "foundModelRaw = candidate;",
    "console.log('__DBG_FIPE__ year-filter chose:', candidate.name); foundModelRaw = candidate;"
  );
  fs.writeFileSync(svcPath, src);
}
const { detectFipeQuery, queryFipe } = require("../dist/services/fipeService");

(async () => {
  const cases = [
    "FIPE Volkswagen Voyage 1.6 2020",
    "fipe voyage 1.6 volkswagen 2020",
    "FIPE volkswagen voyage 2020",
  ];
  for (const text of cases) {
    console.log("\n====", text, "====");
    const det = detectFipeQuery(text);
    console.log("detect:", det);
    if (!det) continue;
    const r = await queryFipe("dbg", det.query, det.vehicleType);
    console.log("brand:", r.brandName, "| model:", r.modelName, "| ok:", r.success);
    console.log(r.message.split("\n").slice(0, 6).join("\n"));
  }
})().catch((e) => { console.error(e); process.exit(1); });
