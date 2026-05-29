/* Simula o pipeline do Baileys (getImageProcessingLibrary + extractImageThumb)
 * usando nosso PNG pré-renderizado. Deve cair no jimp em CPU sem AVX. */
const fs = require("fs");
const path = require("path");

(async () => {
  const png = fs.readFileSync(
    path.resolve(__dirname, "..", "assets", "vehicle-silhouettes", "sedan.png")
  );

  const [jimp, sharp] = await Promise.all([
    import("jimp").catch((err) => {
      console.log("[load] jimp FAIL:", err.message);
      return undefined;
    }),
    import("sharp").catch((err) => {
      console.log("[load] sharp FAIL:", err.message);
      return undefined;
    }),
  ]);

  console.log(
    "[load] sharp=",
    !!sharp,
    "jimp=",
    !!jimp,
    "preferred=",
    sharp ? "sharp" : jimp ? "jimp" : "NONE"
  );

  if (!jimp) throw new Error("Sem jimp disponível");

  const img = await jimp.Jimp.read(png);
  const dims = { width: img.width, height: img.height };
  const thumb = await img
    .resize({ w: 32, mode: jimp.ResizeStrategy.BILINEAR })
    .getBuffer("image/jpeg", { quality: 50 });

  console.log(
    `[OK] jimp thumb gerado: dims=${dims.width}x${dims.height} thumbBytes=${thumb.length}`
  );
})().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
