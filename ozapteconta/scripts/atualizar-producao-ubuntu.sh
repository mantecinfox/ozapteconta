#!/usr/bin/env bash
# Rodar NO SERVIDOR: bash /home/pc/ozapteconta/scripts/atualizar-producao-ubuntu.sh
# Sincroniza arquivos do Git (paths ozapteconta/backend/*) para /home/pc/ozapteconta/backend/*
# e faz build + restart PM2 conforme HANDOFF_IMPLANTACAO.md seção 10.

set -euo pipefail

ROOT="/home/pc/ozapteconta"
BACKEND="${ROOT}/backend"
REF="${1:-origin/main}"

export LANG=pt_BR.UTF-8
export LC_ALL=pt_BR.UTF-8

echo "==> Locale"
locale | head -3 || true

cd "$ROOT"

if [ ! -d ".git" ]; then
  echo "ERRO: $ROOT nao e um repositorio git."
  exit 1
fi

echo "==> Git fetch ($REF)"
git fetch origin

echo "==> Sincronizar ozapteconta/backend/* -> backend/*"
mapfile -t GIT_FILES < <(git ls-tree -r --name-only "$REF" | grep '^ozapteconta/backend/' || true)

if [ "${#GIT_FILES[@]}" -eq 0 ]; then
  echo "AVISO: nenhum arquivo em ozapteconta/backend/ no ref $REF."
  echo "      Se o pull criou pasta aninhada, copie manualmente:"
  echo "      rsync -a --exclude node_modules --exclude dist --exclude .env ozapteconta/backend/ backend/"
else
  for f in "${GIT_FILES[@]}"; do
    dest="${ROOT}/${f#ozapteconta/}"
    mkdir -p "$(dirname "$dest")"
    git show "${REF}:${f}" > "$dest"
  done
fi

# Fallback: pasta aninhada apos git pull incorreto
if [ -d "${ROOT}/ozapteconta/backend/src" ]; then
  echo "==> Rsync pasta aninhada ozapteconta/ozapteconta/backend/"
  rsync -a --exclude node_modules --exclude dist --exclude .env \
    "${ROOT}/ozapteconta/backend/" "${BACKEND}/"
fi

cd "$BACKEND"

echo "==> Dependencias e Prisma"
npm ci --legacy-peer-deps
npm run prisma:generate
npm run prisma:push

echo "==> Build"
npm run build

test -f dist/utils/whatsappText.js
test -f dist/bootstrap/utf8Locale.js
echo "==> UTF-8 compilado OK"

echo "==> PM2"
pm2 restart ecosystem.config.cjs --update-env
pm2 save

sleep 4
curl -fsS "http://127.0.0.1:3001/api/health"
echo ""
pm2 list | head -14

echo "==> Concluido. Teste no WhatsApp:"
echo "    ipca | cdi | ipc fipe | fipezap | fipezap sao paulo | comparar preco iphone"
echo ""
echo "==> (Opcional) Sync cache FipeZap mensal:"
echo "    npx ts-node --project tsconfig.seed.json ../scripts/sync-fipezap-cache.ts"
