import { ensureAppUtf8Locale } from "./bootstrap/utf8Locale";
ensureAppUtf8Locale();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import { config } from "./config";
import { logger } from "./utils/logger";
import { prisma } from "./config/prisma";
import { startReminderCron } from "./services/reminderService";
import recurringBillingService from "./services/recurringBillingService";
import { warmupSilhouetteCache } from "./services/vehicleSilhouetteService";
import { warmupNutritionMealCache } from "./services/nutritionMealImageService";
import { auditAdminRequest } from "./services/adminAuditService";

// Rotas
import webhookRouter from "./routes/webhook";
import webhooksRouter from "./routes/webhooks";
import authRouter from "./routes/auth";
import transactionsRouter from "./routes/transactions";
import settingsRouter from "./routes/settings";
import clientsRouter from "./routes/clients";
import clientPortalRouter from "./routes/clientPortal";
import adminWhatsappAccountsRouter from "./routes/adminWhatsappAccounts";
import botKnowledgeRouter from "./routes/botKnowledge";
import subscriptionsRouter from "./routes/subscriptions";
import paymentGatewaySettingsRouter from "./routes/paymentGatewaySettings";
import adminAuditLogsRouter from "./routes/adminAuditLogs";
import adminPriceSourcesRouter from "./routes/adminPriceSources";

const app = express();

// ─── Middlewares globais ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: [config.frontendUrl, "http://localhost:5173", "http://localhost:3000"],
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(auditAdminRequest);

// ─── Servir áudios armazenados ────────────────────────────────────────────────
const audioDir = config.storage.audioPath;
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
app.use("/storage/audios", express.static(audioDir));

// ─── Rotas da API ─────────────────────────────────────────────────────────────
app.use("/api/webhook", webhookRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/auth", authRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/client-portal", clientPortalRouter);
app.use("/api/admin-whatsapp-accounts", adminWhatsappAccountsRouter);
app.use("/api/bot-knowledge", botKnowledgeRouter);
app.use("/api/subscriptions", subscriptionsRouter);
app.use("/api/admin/audit-logs", adminAuditLogsRouter);
app.use("/api/admin", paymentGatewaySettingsRouter);
app.use("/api/admin", adminPriceSourcesRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── Servir frontend em produção ──────────────────────────────────────────────
if (config.nodeEnv === "production") {
  const frontendDist = path.resolve(__dirname, "../../frontend/dist");
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }
}

// ─── Inicialização ────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info("✅ Banco de dados conectado");
  } catch (err) {
    logger.error("❌ Falha ao conectar ao banco de dados:", err);
    process.exit(1);
  }

  // Inicia cron de lembretes
  startReminderCron();

  // Inicia cobrança recorrente
  recurringBillingService.start();

  // Pré-carrega imagens fixas em RAM (FIPE + refeição nutrição)
  warmupSilhouetteCache();
  warmupNutritionMealCache();

  app.listen(config.port, () => {
    logger.info(`\n${"═".repeat(50)}`);
    logger.info(`🚀 ozapteconta Backend rodando!`);
    logger.info(`   Porta:    ${config.port}`);
    logger.info(`   Ambiente: ${config.nodeEnv}`);
    logger.info(`   Webhook:  http://localhost:${config.port}/api/webhook`);
    logger.info(`   API:      http://localhost:${config.port}/api`);
    logger.info(`${"═".repeat(50)}\n`);
  });
}

bootstrap();

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM recebido. Encerrando...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT recebido. Encerrando...");
  await prisma.$disconnect();
  process.exit(0);
});
