#!/bin/bash
set -e
cd /home/pc/ozapteconta/backend
DBURL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')
export PGPASSWORD=$(echo "$DBURL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
PGUSER_X=$(echo "$DBURL" | sed -E 's|.*://([^:]+):.*|\1|')
PGDB_X=$(echo "$DBURL" | sed -E 's|.*/([^?]+).*|\1|')
echo "user=$PGUSER_X db=$PGDB_X"

echo '--- UPDATE PriceSearchSource ---'
psql -h 127.0.0.1 -U "$PGUSER_X" -d "$PGDB_X" -v ON_ERROR_STOP=1 -f /tmp/mlb_update.sql

echo '--- placeholders no .env ---'
grep -q '^MERCADO_LIVRE_CLIENT_ID=' .env || echo 'MERCADO_LIVRE_CLIENT_ID=' >> .env
grep -q '^MERCADO_LIVRE_CLIENT_SECRET=' .env || echo 'MERCADO_LIVRE_CLIENT_SECRET=' >> .env
grep -E '^MERCADO_LIVRE_' .env

echo '--- limpar cache Redis ---'
redis-cli --scan --pattern 'pricecmp:mercado_livre:*' | xargs -r redis-cli DEL
redis-cli --scan --pattern 'pricecmp:agg:*' | xargs -r redis-cli DEL

echo '--- restart PM2 ---'
pm2 restart ozapteconta --update-env
sleep 2
pm2 status ozapteconta
