#!/usr/bin/env bash
# Envia link de renovação InfinityPay para o cliente João (id=1) em produção.
# Rodar NO SERVIDOR: bash /home/pc/ozapteconta/scripts/test-renewal-joao-producao.sh

set -euo pipefail

ROOT="/home/pc/ozapteconta"
BACKEND="${ROOT}/backend"
CLIENT_ID="${1:-1}"

cd "$BACKEND"

echo "==> Build backend (se necessário)"
npm run build

echo "==> Enviando link de renovação para cliente #${CLIENT_ID}"
node <<NODE
require("dotenv").config({ path: "${BACKEND}/.env" });
const recurringBillingService = require("./dist/services/recurringBillingService").default;

(async () => {
  const clientId = Number(process.env.CLIENT_ID || "${CLIENT_ID}");
  const result = await recurringBillingService.sendRenewalLinkToClient(clientId);
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exit(1);
})();
NODE

echo "==> Concluído. Verifique WhatsApp do cliente e logs PM2."
