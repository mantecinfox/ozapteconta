const { PrismaClient } = require('./dist/prisma/generated/client');
const p = new PrismaClient();
p.systemSetting.findMany({ where: { key: { startsWith: 'wa_alias' } } })
  .then(r => { console.log('ALIASES:', JSON.stringify(r, null, 2)); })
  .catch(e => console.error('ERROR:', e.message))
  .finally(() => p.$disconnect());
