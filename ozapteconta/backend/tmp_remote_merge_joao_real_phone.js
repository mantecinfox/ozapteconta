const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

function buildHash(value) {
  return crypto.createHash("sha256").update(`ozapteconta:wa:${value}`).digest("hex").slice(0, 40);
}

async function main() {
  const legacyLid = "107812755628191@lid";
  const legacyDigits = "107812755628191";
  const realPhone = "553185297356";

  const profile = await prisma.clientProfile.findFirst({ where: { cpf: "77737121668" } });
  const legacyUser = await prisma.whatsappUser.findFirst({ where: { phone: legacyDigits } });
  const realUser = await prisma.whatsappUser.findFirst({ where: { phone: realPhone } });

  if (profile) {
    await prisma.clientProfile.update({ where: { id: profile.id }, data: { phone: realPhone } });
  }

  if (legacyUser && realUser && legacyUser.id !== realUser.id) {
    await prisma.whatsappUser.delete({ where: { id: realUser.id } });
  }

  if (legacyUser) {
    await prisma.whatsappUser.update({
      where: { id: legacyUser.id },
      data: {
        phone: realPhone,
        registrationStep: null,
        registrationData: {},
      },
    });
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

  console.log(JSON.stringify({
    profileUpdated: Boolean(profile),
    legacyUserUpdated: Boolean(legacyUser),
    duplicateRealUserRemoved: Boolean(legacyUser && realUser && legacyUser.id !== realUser.id),
    realPhone,
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
