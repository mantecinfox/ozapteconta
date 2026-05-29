require("dotenv").config();
const { queryFipe } = require("../dist/services/fipeService");
const t0 = Date.now();
queryFipe("test", "volkswagen voyage 1 6 2020", "cars")
  .then((r) => {
    console.log("elapsed_ms=", Date.now() - t0);
    console.log("success=", r.success);
    console.log((r.message || "").split("\n").slice(0, 6).join("\n"));
  })
  .catch((e) => {
    console.error("FAIL", e);
    process.exit(1);
  });
