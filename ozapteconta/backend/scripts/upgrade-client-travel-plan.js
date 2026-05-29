/**
 * Atualiza cliente para plano TRAVEL (dev/produção).
 * Uso: node scripts/upgrade-client-travel-plan.js [clientId|phone]
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const TARGET_PHONE = "553185297356";
const TARGET_CLIENT_ID = 1;

async function main() {
  const arg = String(process.argv[2] || "").trim();
  const travelPlan = await prisma.subscriptionPlan.findUnique({
    where: { plan: "TRAVEL" },
  });

  if (!travelPlan) {
    throw new Error("Plano TRAVEL não encontrado no banco. Execute prisma:seed.");
  }

  const priceMonthly = Number(travelPlan.priceMonthly);

  const client = arg
    ? await prisma.clientProfile.findFirst({
        where: Number.isFinite(Number(arg))
          ? { id: Number(arg) }
          : { phone: { contains: arg.replace(/\D/g, "") } },
        include: { subscription: true },
      })
    : await prisma.clientProfile.findFirst({
        where: {
          OR: [{ id: TARGET_CLIENT_ID }, { phone: { contains: TARGET_PHONE } }],
        },
        include: { subscription: true },
        orderBy: { id: "asc" },
      });

  if (!client) {
    throw new Error("Cliente não encontrado.");
  }

  const updatedProfile = await prisma.clientProfile.update({
    where: { id: client.id },
    data: { plan: "TRAVEL" },
  });

  let updatedSubscription = client.subscription;
  if (client.subscription) {
    updatedSubscription = await prisma.clientSubscription.update({
      where: { id: client.subscription.id },
      data: {
        plan: "TRAVEL",
        priceMonthly,
      },
    });
  } else {
    updatedSubscription = await prisma.clientSubscription.create({
      data: {
        clientId: client.id,
        plan: "TRAVEL",
        status: "ACTIVE",
        priceMonthly,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        clientId: updatedProfile.id,
        fullName: updatedProfile.fullName,
        phone: updatedProfile.phone,
        plan: updatedProfile.plan,
        status: updatedProfile.status,
        subscription: {
          id: updatedSubscription.id,
          plan: updatedSubscription.plan,
          status: updatedSubscription.status,
          priceMonthly: Number(updatedSubscription.priceMonthly),
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(JSON.stringify({ ok: false, error: String(err) }));
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
