#!/bin/bash
DB_URL="postgresql://ozapteconta:a311542cac75dfac364c826153d786c23e4c1e9f5753b112@localhost:5432/ozapteconta"
echo "=== TABELAS ==="
psql "$DB_URL" -c '\dt' 2>&1
echo "=== system_settings ==="
psql "$DB_URL" -c 'SELECT key, value FROM system_settings WHERE key LIKE '"'"'wa_alias%'"'"';' 2>&1
