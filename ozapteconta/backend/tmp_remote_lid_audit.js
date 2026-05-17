const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const lidProfiles = await prisma.clientProfile.findMany({
    where: { phone: { endsWith: "@lid" } },
    include: { subscription: true },
    orderBy: { id: "asc" },
  });

  const summary = lidProfiles.map((profile) => ({
    id: profile.id,
    fullName: profile.fullName,
    phone: profile.phone,
    cpf: profile.cpf,
    cnpj: profile.cnpj,
    status: profile.status,
    plan: profile.plan,
    subscriptionStatus: profile.subscription?.status || null,
    normalizedPhone: String(profile.phone || "").replace(/@lid$/, ""),
  }));

  console.log(JSON.stringify({ count: summary.length, profiles: summary }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
