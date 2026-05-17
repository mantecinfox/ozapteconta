#!/bin/bash
# Try to find .env file and use DATABASE_URL
DB_URL=$(grep DATABASE_URL /home/pc/ozapteconta/backend/.env 2>/dev/null | cut -d= -f2-)
echo "DB_URL: $DB_URL"
# Try using psql with the connection from env
if [ -n "$DB_URL" ]; then
  psql "$DB_URL" -c 'SELECT key, value FROM "SystemSetting" WHERE key LIKE '"'"'wa_alias%'"'"';' 2>&1
fi
