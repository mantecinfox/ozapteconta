/* Diagnóstico: identificar qual lib nativa crasha com SIGILL na CPU antiga. */
const fs = require("fs");
const path = require("path");

const cases = [
  { name: "sharp (require)", run: () => require("sharp") },
  { name: "sharp.metadata(PNG)", run: async () => {
      const sharp = require("sharp");
      const png = fs.readFileSync(
        path.resolve(__dirname, "..", "assets", "vehicle-silhouettes", "sedan.png")
      );
      return await sharp(png).metadata();
    },
  },
  { name: "sharp.resize(PNG)", run: async () => {
      const sharp = require("sharp");
      const png = fs.readFileSync(
        path.resolve(__dirname, "..", "assets", "vehicle-silhouettes", "sedan.png")
      );
      return await sharp(png).resize(100).jpeg().toBuffer();
    },
  },
];

(async () => {
  for (const c of cases) {
    process.stdout.write(`[try] ${c.name} ... `);
    try {
      const out = await c.run();
      const tag = Buffer.isBuffer(out)
        ? `buffer ${out.length}B`
        : typeof out === "object"
        ? JSON.stringify(out).slice(0, 80)
        : String(out);
      console.log(`OK (${tag})`);
    } catch (err) {
      console.log(`FAIL: ${err && err.message ? err.message : err}`);
    }
  }
})();
