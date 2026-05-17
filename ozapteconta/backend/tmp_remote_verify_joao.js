const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const profiles = await prisma.clientProfile.findMany({
    where: { cpf: "77737121668" },
    include: { subscription: true },
  });

  const whatsappUsers = await prisma.whatsappUser.findMany({
    where: {
      OR: [
        { phone: { contains: "107812755628191" } },
        { phone: { contains: "553185297356" } },
      ],
    },
    orderBy: { id: "asc" },
  });

  const aliases = await prisma.systemSetting.findMany({
    where: {
      OR: [
        { key: { contains: "107812755628191" } },
        { key: { contains: "553185297356" } },
      ],
    },
    orderBy: { key: "asc" },
  });

  console.log(JSON.stringify({ profiles, whatsappUsers, aliases }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
