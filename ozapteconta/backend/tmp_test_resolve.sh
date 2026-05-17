#!/bin/bash
DB_URL="postgresql://ozapteconta:a311542cac75dfac364c826153d786c23e4c1e9f5753b112@localhost:5432/ozapteconta"
echo "=== dist/services/whatsappIdentityService.js ==="
ls -la /home/pc/ozapteconta/backend/dist/services/whatsappIdentityService.js 2>&1
echo ""
echo "=== Prisma client has systemSetting? ==="
node -e "const { PrismaClient } = require('/home/pc/ozapteconta/backend/node_modules/@prisma/client'); const p = new PrismaClient(); console.log('systemSetting exists:', typeof p.systemSetting); p.\$disconnect();" 2>&1
echo ""
echo "=== Test resolveWhatsappIdentity directly ==="
node -e "
const svc = require('/home/pc/ozapteconta/backend/dist/services/whatsappIdentityService');
svc.resolveWhatsappIdentity('107812755628191@lid')
  .then(r => { console.log('RESULT:', JSON.stringify(r)); })
  .catch(e => { console.error('ERROR:', e.message); });
" 2>&1
