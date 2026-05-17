import nodemailer from "nodemailer";
import { config } from "../config";
import { logger } from "../utils/logger";

let transporter: nodemailer.Transporter | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(
    config.email.host &&
      config.email.port &&
      config.email.from &&
      config.email.user &&
      config.email.pass,
  );
}

function getTransporter(): nodemailer.Transporter | null {
  if (!isEmailConfigured()) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: config.email.user
      ? {
          user: config.email.user,
          pass: config.email.pass,
        }
      : undefined,
  });

  return transporter;
}

export async function sendEmailWithAttachment(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fileName: string;
  content: Buffer;
  contentType?: string;
}): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) return false;

  try {
    await mailer.sendMail({
      from: config.email.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
      attachments: [
        {
          filename: params.fileName,
          content: params.content,
          contentType: params.contentType || "application/pdf",
        },
      ],
    });
    logger.info(`[Email] Relatório enviado para ${params.to}`);
    return true;
  } catch (error) {
    logger.error(`[Email] Falha ao enviar relatório para ${params.to}:`, error);
    return false;
  }
}