#!/usr/bin/env bash
# Rodar NO SERVIDOR Ubuntu (usuário pc):
#   bash /home/pc/ozapteconta/scripts/ubuntu-infinitypay-setup-test.sh
#
# Configura InfinitePay (somente Merchant Key) e testa geração de link.

set -euo pipefail

ROOT="/home/pc/ozapteconta"
BACKEND="${ROOT}/backend"
ENV_FILE="${BACKEND}/.env"
MERCHANT_KEY="${INFINITYPAY_MERCHANT_KEY:-\$mantecinfoxsystem}"
API_URL="${INFINITYPAY_API_URL:-https://api.checkout.infinitepay.io}"

echo "==> InfinitePay — setup + teste (Ubuntu)"
echo "    Merchant Key: ${MERCHANT_KEY}"

if [ ! -d "$BACKEND" ]; then
  echo "ERRO: pasta backend não encontrada: $BACKEND"
  exit 1
fi

cd "$BACKEND"

# ── 1. .env ──────────────────────────────────────────────────────────────────
touch "$ENV_FILE"

set_env_var() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

set_env_var "INFINITYPAY_MERCHANT_KEY" "$MERCHANT_KEY"
set_env_var "INFINITYPAY_API_URL" "$API_URL"

if ! grep -q "^INFINITYPAY_API_KEY=" "$ENV_FILE" 2>/dev/null; then
  echo "INFINITYPAY_API_KEY=" >> "$ENV_FILE"
fi

echo "==> .env atualizado (sem expor segredos)"
grep -E '^INFINITYPAY_' "$ENV_FILE" | sed 's/=.*/=***/'

set -a
# shellcheck disable=SC1090
source "$ENV_FILE" 2>/dev/null || true
set +a
export INFINITYPAY_MERCHANT_KEY="$MERCHANT_KEY"
export INFINITYPAY_API_URL="$API_URL"

# ── 2. Banco — gateway infinitypay ───────────────────────────────────────────
echo "==> Atualizando payment_gateway_configs no PostgreSQL"
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
const merchant = process.env.INFINITYPAY_MERCHANT_KEY || "$mantecinfoxsystem";

(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.paymentGatewayConfig.upsert({
      where: { provider: "infinitypay" },
      create: {
        provider: "infinitypay",
        displayName: "InfinitePay",
        isEnabled: true,
        isPrimary: true,
        environment: "production",
        infinityPayMerchantKey: merchant,
        infinityPayApiKey: null,
      },
      update: {
        infinityPayMerchantKey: merchant,
        isEnabled: true,
        isPrimary: true,
      },
    });
    console.log("OK: infinitypay configurado no banco com Merchant Key");
  } finally {
    await prisma.$disconnect();
  }
})();
NODE

# ── 3. Build (se dist desatualizado) ─────────────────────────────────────────
if [ ! -f dist/services/infinityPayService.js ]; then
  echo "==> dist ausente — rodando build"
  npm run build
fi

# ── 4. Teste HTTP direto (sem API Key) ───────────────────────────────────────
echo "==> Teste API InfinitePay POST /links"
node <<NODE
const handle = "${MERCHANT_KEY}".replace(/^\$/, "").trim();
const payload = {
  handle,
  items: [{ quantity: 1, price: 990, description: "Teste ozapteconta Ubuntu" }],
  order_nsu: "ubuntu-test-" + Date.now(),
  customer: { name: "Teste Ubuntu", email: "teste@ozapteconta.app", phone_number: "+5531999999999" },
};
fetch("${API_URL}/links", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(30000),
})
  .then(async (r) => {
    const body = await r.text();
    console.log("HTTP", r.status);
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    console.log(typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2));
    if (!r.ok) process.exit(1);
    const url = parsed?.url || parsed?.checkout_url || parsed?.link;
    if (!url) {
      console.error("ERRO: resposta sem URL de checkout");
      process.exit(1);
    }
    console.log("SUCESSO: link gerado");
  })
  .catch((e) => {
    console.error("ERRO:", e.message);
    process.exit(1);
  });
NODE

# ── 5. Teste via serviço compilado ───────────────────────────────────────────
echo "==> Teste infinityPayService.createPaymentLink (dist)"
node <<'NODE'
const path = require("path");
require("dotenv").config({ path: path.join(process.cwd(), ".env") });
const svc = require("./dist/services/infinityPayService").default;

(async () => {
  const configured = await svc.isConfigured();
  console.log("isConfigured:", configured);
  const res = await svc.createPaymentLink({
    amount: 9.9,
    description: "Plano Completo - teste Ubuntu",
    customer_email: "teste@ozapteconta.app",
    customer_name: "Teste Ubuntu",
    customer_phone: "5531999999999",
    payment_methods: ["pix", "credit_card", "boleto"],
    metadata: { test: true, source: "ubuntu-infinitypay-setup-test" },
  });
  if (!res.success) {
    console.error("FALHA createPaymentLink:", res.error);
    process.exit(1);
  }
  const url = res.data?.resolved_url || res.data?.url;
  console.log("createPaymentLink OK:", url || JSON.stringify(res.data));
})();
NODE

# ── 6. PM2 ───────────────────────────────────────────────────────────────────
echo "==> Reiniciando PM2 com --update-env"
pm2 restart ozapteconta --update-env 2>/dev/null || pm2 restart ecosystem.config.cjs --update-env
sleep 3
curl -fsS "http://127.0.0.1:3001/api/health" && echo ""

echo ""
echo "==> Concluído."
echo "    Painel admin: Gateway de Pagamento → Testar conexão"
echo "    Logs: pm2 logs ozapteconta --lines 50 | grep -i infinity"
