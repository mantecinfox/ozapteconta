const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const joaoProfiles = await prisma.clientProfile.findMany({
    where: { cpf: "77737121668" },
    include: { subscription: true },
    orderBy: { id: "asc" },
  });

  const joaoUsers = await prisma.whatsappUser.findMany({
    where: {
      OR: [
        { name: { contains: "João", mode: "insensitive" } },
        { phone: { contains: "553185297356" } },
        { phone: { contains: "107812755628191" } },
      ],
    },
    orderBy: { id: "asc" },
  });

  console.log(JSON.stringify({ joaoProfiles, joaoUsers }, null, 2));
}

main().finally(async () => prisma.$disconnect());
