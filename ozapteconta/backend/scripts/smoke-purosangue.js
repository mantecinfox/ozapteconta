const sil = require("../dist/services/vehicleSilhouetteService");
sil.warmupSilhouetteCache();
(async () => {
  const car = await sil.resolveSilhouette("VW", "Gol", "cars");
  const moto = await sil.resolveSilhouette("Honda", "CG", "motorcycles");
  const truck = await sil.resolveSilhouette("Scania", "R440", "trucks");
  const png = sil.getSilhouettePng(car.key);
  console.log("cars=", car.key, "png=", png ? png.length : 0);
  console.log("moto=", moto.key);
  console.log("truck=", truck.key, truck.source);
})();
