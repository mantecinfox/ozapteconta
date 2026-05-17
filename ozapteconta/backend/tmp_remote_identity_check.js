const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const keys = await prisma.systemSetting.findMany({
    where: {
      OR: [
        { key: { startsWith: "wa_alias:" } },
        { key: { startsWith: "wa_aliases:" } },
      ],
    },
    orderBy: { key: "asc" },
  });

  const lidProfiles = await prisma.clientProfile.findMany({
    where: { phone: { endsWith: "@lid" } },
    orderBy: { id: "asc" },
  });

  console.log(JSON.stringify({ lidProfilesRemaining: lidProfiles.length, aliasKeys: keys }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
