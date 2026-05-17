const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const aliasSettings = await prisma.systemSetting.findMany({
    where: { key: { startsWith: "wa_alias:" } },
    orderBy: { key: "asc" },
  });

  const results = [];

  for (const setting of aliasSettings) {
    const alias = setting.key.replace(/^wa_alias:/, "");
    const canonical = String(setting.value || "").trim();
    const stripped = alias.endsWith("@lid") ? alias.slice(0, -4) : "";
    const candidates = Array.from(new Set([alias, stripped].filter(Boolean))).filter((value) => value !== canonical);

    for (const candidate of candidates) {
      const profiles = await prisma.clientProfile.findMany({
        where: { phone: candidate },
        select: { id: true, phone: true, fullName: true },
      });

      for (const profile of profiles) {
        const conflict = await prisma.clientProfile.findFirst({
          where: { phone: canonical, NOT: { id: profile.id } },
          select: { id: true },
        });

        if (conflict) {
          results.push({ profileId: profile.id, from: candidate, to: canonical, migrated: false, reason: `conflict:${conflict.id}` });
          continue;
        }

        await prisma.clientProfile.update({ where: { id: profile.id }, data: { phone: canonical } });
        results.push({ profileId: profile.id, from: candidate, to: canonical, migrated: true });
      }

      const updatedWhatsappUsers = await prisma.whatsappUser.updateMany({
        where: { phone: candidate },
        data: { phone: canonical },
      });

      if (updatedWhatsappUsers.count > 0) {
        results.push({ entity: "whatsappUser", from: candidate, to: canonical, migratedCount: updatedWhatsappUsers.count });
      }
    }
  }

  console.log(JSON.stringify({ processedAliases: aliasSettings.length, results }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
