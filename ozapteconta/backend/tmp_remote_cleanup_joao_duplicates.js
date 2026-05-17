const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

function buildHash(value) {
  return crypto.createHash("sha256").update(`ozapteconta:wa:${value}`).digest("hex").slice(0, 40);
}

async function main() {
  const realPhone = "553185297356";
  const legacyDigits = "107812755628191";
  const legacyLid = "107812755628191@lid";

  const profile = await prisma.clientProfile.findFirst({ where: { cpf: "77737121668" } });
  if (profile) {
    await prisma.clientProfile.update({ where: { id: profile.id }, data: { phone: realPhone } });
  }

  const users = await prisma.whatsappUser.findMany({
    where: { phone: { in: [realPhone, legacyDigits, legacyLid] } },
    orderBy: [{ totalTransactions: "desc" }, { updatedAt: "desc" }],
  });

  const keeper = users.find((u) => u.phone === realPhone) || users[0] || null;

  if (keeper) {
    if (keeper.phone !== realPhone) {
      await prisma.whatsappUser.update({
        where: { id: keeper.id },
        data: { phone: realPhone, registrationStep: null, registrationData: {} },
      });
    }

    for (const u of users) {
      if (u.id === keeper.id) continue;
      await prisma.whatsappUser.delete({ where: { id: u.id } });
    }
  }

  await prisma.systemSetting.upsert({
    where: { key: `wa_alias:${legacyLid}` },
    update: { value: realPhone },
    create: { key: `wa_alias:${legacyLid}`, value: realPhone },
  });

  await prisma.systemSetting.upsert({
    where: { key: `wa_aliases:${realPhone}` },
    update: { value: JSON.stringify([legacyLid, legacyDigits, realPhone]) },
    create: { key: `wa_aliases:${realPhone}`, value: JSON.stringify([legacyLid, legacyDigits, realPhone]) },
  });

  await prisma.systemSetting.upsert({
    where: { key: `wa_hash:${realPhone}` },
    update: { value: buildHash(realPhone) },
    create: { key: `wa_hash:${realPhone}`, value: buildHash(realPhone) },
  });

  const afterUsers = await prisma.whatsappUser.findMany({
    where: { phone: { in: [realPhone, legacyDigits, legacyLid] } },
    orderBy: { id: "asc" },
  });

  const afterProfile = await prisma.clientProfile.findFirst({ where: { cpf: "77737121668" } });

  console.log(JSON.stringify({
    keeperId: keeper?.id || null,
    profilePhone: afterProfile?.phone || null,
    usersBefore: users.map((u) => ({ id: u.id, phone: u.phone, registrationStep: u.registrationStep })),
    usersAfter: afterUsers.map((u) => ({ id: u.id, phone: u.phone, registrationStep: u.registrationStep })),
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
