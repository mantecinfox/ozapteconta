#!/usr/bin/env bash
set -euo pipefail
cd /home/pc/ozapteconta/backend

echo "==> Aguardando WhatsApp (20s)..."
sleep 20

TOKEN=$(curl -sS -X POST http://127.0.0.1:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

echo "==> Enviando link de renovacao para cliente #1"
RESP=$(curl -sS -X POST http://127.0.0.1:3001/api/clients/1/send-renewal-link \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json")

echo "$RESP"

echo "==> Logs recentes WhatsApp"
pm2 logs ozapteconta --lines 30 --nostream 2>&1 | grep -E '553185297356|NAO enviada|Link enviado|conectada' | tail -8 || true
