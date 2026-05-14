const { sendFinancialReportNow } = require("./src/services/financialReportService");
(async () => {
  const result = await sendFinancialReportNow("185950776856729@lid");
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
