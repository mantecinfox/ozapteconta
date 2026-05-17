const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const lidProfiles = await prisma.clientProfile.findMany({
    where: { phone: { endsWith: "@lid" } },
    orderBy: { id: "asc" },
  });

  const results = [];

  for (const profile of lidProfiles) {
    const legacyPhone = String(profile.phone || "");
    const normalizedPhone = legacyPhone.replace(/@lid$/, "");
    if (!normalizedPhone) continue;

    const conflicting = await prisma.clientProfile.findFirst({
      where: { phone: normalizedPhone, NOT: { id: profile.id } },
      select: { id: true },
    });

    if (!conflicting) {
      await prisma.clientProfile.update({
        where: { id: profile.id },
        data: { phone: normalizedPhone },
      });
    }

    await prisma.systemSetting.upsert({
      where: { key: `wa_alias:${legacyPhone}` },
      update: { value: normalizedPhone },
      create: { key: `wa_alias:${legacyPhone}`, value: normalizedPhone },
    });

    const existingAliases = await prisma.systemSetting.findUnique({
      where: { key: `wa_aliases:${normalizedPhone}` },
    });

    let aliases = [legacyPhone, normalizedPhone];
    if (existingAliases?.value) {
      try {
        const parsed = JSON.parse(existingAliases.value);
        if (Array.isArray(parsed)) {
          aliases = Array.from(new Set([...parsed.map(String), legacyPhone, normalizedPhone]));
        }
      } catch {}
    }

    await prisma.systemSetting.upsert({
      where: { key: `wa_aliases:${normalizedPhone}` },
      update: { value: JSON.stringify(aliases) },
      create: { key: `wa_aliases:${normalizedPhone}`, value: JSON.stringify(aliases) },
    });

    results.push({
      profileId: profile.id,
      fullName: profile.fullName,
      legacyPhone,
      normalizedPhone,
      updatedProfile: !conflicting,
      conflictingProfileId: conflicting?.id || null,
    });
  }

  console.log(JSON.stringify({ fixedCount: results.length, results }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
