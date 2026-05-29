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

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildClientEmailHtml(params: {
  subject: string;
  recipientName?: string;
  text: string;
  html?: string;
}): string {
  const rawHtml = String(params.html || "").trim();

  // Se já vier com documento HTML completo (ex.: template premium do relatório), preserva como está.
  if (rawHtml.toLowerCase().includes("<html")) {
    return rawHtml;
  }

  const firstName = (params.recipientName || "").trim().split(" ")[0];
  const greeting = firstName ? `Olá, ${escapeHtml(firstName)}!` : "Olá!";
  const contentHtml = rawHtml || `<p style="margin:0;white-space:pre-line;">${escapeHtml(params.text)}</p>`;
  const title = escapeHtml(params.subject);

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f8;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d9e2ee;box-shadow:0 10px 26px rgba(11,18,32,.06);">
            <tr>
              <td style="padding:22px 28px;background:linear-gradient(135deg,#0b1220 0%,#12324a 55%,#1d4ed8 100%);color:#ffffff;">
                <div style="font-size:22px;font-weight:800;line-height:1;">ozapteconta</div>
                <div style="margin-top:6px;font-size:12px;opacity:.82;">Inteligência financeira no WhatsApp</div>
                <div style="margin-top:14px;font-size:18px;font-weight:700;line-height:1.35;">${title}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <p style="margin:0 0 10px 0;font-size:18px;font-weight:600;color:#0f172a;">${greeting}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 22px 28px;font-size:14px;line-height:1.7;color:#334155;">
                ${contentHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.6;">
                Este é um envio automático do ozapteconta.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendMail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  recipientName?: string;
  skipClientTemplate?: boolean;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
}): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) return false;

  try {
    const html = params.skipClientTemplate
      ? params.html
      : buildClientEmailHtml({
          subject: params.subject,
          recipientName: params.recipientName,
          text: params.text,
          html: params.html,
        });

    await mailer.sendMail({
      from: config.email.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html,
      attachments: params.attachments,
    });
    logger.info(`[Email] E-mail enviado para ${params.to}`);
    return true;
  } catch (error) {
    logger.error(`[Email] Falha ao enviar e-mail para ${params.to}:`, error);
    return false;
  }
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
  recipientName?: string;
  skipClientTemplate?: boolean;
  fileName: string;
  content: Buffer;
  contentType?: string;
}): Promise<boolean> {
  return sendMail({
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
    recipientName: params.recipientName,
    skipClientTemplate: params.skipClientTemplate,
    attachments: [
      {
        filename: params.fileName,
        content: params.content,
        contentType: params.contentType || "application/pdf",
      },
    ],
  });
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  recipientName?: string;
  skipClientTemplate?: boolean;
}): Promise<boolean> {
  return sendMail(params);
}