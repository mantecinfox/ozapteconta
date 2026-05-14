import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { processText, processAudio } from "../services/messageProcessor";

const router = Router();

function isGroupOrBroadcastSender(sender: string): boolean {
  const s = String(sender || "").trim().toLowerCase();
  if (!s) return true;
  if (s.endsWith("@g.us")) return true;
  if (s === "status@broadcast" || s.endsWith("@broadcast")) return true;
  // Em alguns payloads, grupos podem aparecer como id com hífen (ex: 5511...-1234567890)
  if (s.includes("-") && !s.includes("@")) return true;
  return false;
}

// GET /api/webhook — verificação do webhook pelo Meta
router.get("/", async (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  try {
    const cfg = await prisma.whatsappConfig.findFirst();
    const verifyToken = cfg?.verifyToken || "meu_verify_token_secreto";

    if (mode === "subscribe" && token === verifyToken) {
      logger.info("[Webhook] Verificação bem-sucedida");
      res.status(200).send(challenge);
    } else {
      logger.warn(`[Webhook] Verificação falhou. Token recebido: ${token}`);
      res.status(403).json({ error: "Verificação falhou" });
    }
  } catch (err) {
    logger.error("[Webhook] Erro na verificação:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// POST /api/webhook — receber mensagens
router.post("/", (req: Request, res: Response) => {
  // Responde 200 imediatamente para evitar retentativas do Meta
  res.status(200).json({ status: "ok" });

  // Processa em background
  setImmediate(async () => {
    try {
      const body = req.body as {
        object?: string;
        entry?: Array<{
          changes?: Array<{
            field?: string;
            value?: {
              contacts?: Array<{ wa_id: string; profile?: { name: string } }>;
              messages?: Array<{
                id: string;
                from: string;
                type: string;
                text?: { body: string };
                audio?: { id: string; mime_type: string };
              }>;
            };
          }>;
        }>;
      };

      if (body.object !== "whatsapp_business_account") return;

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== "messages") continue;

          const value = change.value;
          if (!value?.messages?.length) continue;

          for (const msg of value.messages) {
            const phone = msg.from;
            if (isGroupOrBroadcastSender(phone)) {
              logger.info(`[Webhook] Grupo/Broadcast bloqueado por regra: ${phone}`);
              continue;
            }

            const contact = value.contacts?.find((c) => c.wa_id === phone);
            const name = contact?.profile?.name;

            logger.info(`[Webhook] Mensagem de ${phone} (${name || "desconhecido"}): tipo=${msg.type}`);

            if (msg.type === "text" && msg.text?.body) {
              await processText(phone, name, msg.text.body);
            } else if (msg.type === "audio" && msg.audio?.id) {
              await processAudio(phone, name, msg.audio.id, msg.audio.mime_type || "audio/ogg");
            } else {
              logger.debug(`[Webhook] Tipo não suportado: ${msg.type}`);
            }
          }
        }
      }
    } catch (err) {
      logger.error("[Webhook] Erro ao processar mensagem:", err);
    }
  });
});

export default router;
