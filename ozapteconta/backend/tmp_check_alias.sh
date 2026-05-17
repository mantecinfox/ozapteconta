#!/bin/bash
psql -U postgres -d ozapteconta -c 'SELECT key, value FROM "SystemSetting" WHERE key LIKE '"'"'wa_alias%'"'"';' 2>&1 || \
sudo -u postgres psql -d ozapteconta -c 'SELECT key, value FROM "SystemSetting" WHERE key LIKE '"'"'wa_alias%'"'"';' 2>&1
