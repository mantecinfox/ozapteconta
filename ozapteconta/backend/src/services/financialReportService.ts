import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { prisma } from "../config/prisma";
import { config } from "../config";
import { logger } from "../utils/logger";
import { formatCurrency, formatDate, sendDocument, sendMessage } from "./whatsappService";
import { isEmailConfigured, sendEmailWithAttachment } from "./emailService";

type ReportPeriod = "weekly" | "daily";

type ReportTransaction = {
  id: number;
  tipo: string;
  categoria: string;
  natureza: "PAGAR" | "RECEBER";
  status: string;
  valor: number;
  vencimento: Date | null;
  paidAt: Date | null;
  createdAt: Date;
};

function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function getPeriodRange(period: ReportPeriod): { start: Date; end: Date; title: string; fileTag: string } {
  const now = new Date();

  if (period === "daily") {
    const start = startOfDay(now);
    const end = endOfDay(now);
    const dateLabel = now.toLocaleDateString("pt-BR");
    return {
      start,
      end,
      title: `Relatório Diário - ${dateLabel}`,
      fileTag: `diario-${dateLabel.replace(/\//g, "-")}`,
    };
  }

  const end = endOfDay(now);
  const start = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  return {
    start,
    end,
    title: `Relatório Semanal - ${start.toLocaleDateString("pt-BR")} a ${end.toLocaleDateString("pt-BR")}`,
    fileTag: `semanal-${start.toLocaleDateString("pt-BR").replace(/\//g, "-")}-${end.toLocaleDateString("pt-BR").replace(/\//g, "-")}`,
  };
}

function truncate(text: string, max: number): string {
  const value = String(text || "");
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function buildReportEmailHtml(params: {
  recipientName?: string | null;
  title: string;
  result: string;
  periodLabel: string;
}): string {
  const name = (params.recipientName || "").trim().split(" ")[0] || "";
  const greeting = name ? `Olá, ${name}!` : "Olá!";

  return `
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${params.title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbe5f2;">
            <tr>
              <td style="padding:24px 28px;background:linear-gradient(135deg,#0b1220 0%,#12324a 55%,#1e3a8a 100%);color:#ffffff;">
                <div style="font-size:24px;font-weight:700;letter-spacing:.2px;">ozapteconta</div>
                <div style="margin-top:8px;font-size:14px;opacity:.9;">Relatorio financeiro com visual profissional</div>
              </td>
            </tr>

            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 12px 0;font-size:16px;line-height:1.5;">${greeting}</p>
                <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#334155;">
                  Seu <strong>${params.periodLabel}</strong> foi gerado com sucesso e segue em anexo neste e-mail.
                </p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px 0;background:#f8fbff;border:1px solid #d7e6fb;border-radius:12px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;">Resultado final</div>
                      <div style="margin-top:6px;font-size:24px;font-weight:700;color:#0f172a;">${params.result}</div>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 20px 0;font-size:13px;line-height:1.6;color:#475569;">
                  Dica: para manter um acompanhamento mais preciso, revise periodicamente suas contas no painel.
                </p>

                <a href="${config.frontendUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:13px;font-weight:600;">
                  Acessar painel
                </a>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;color:#64748b;line-height:1.6;">
                  Este e-mail foi enviado automaticamente pelo ozapteconta.<br/>
                  Se tiver qualquer dúvida, responda esta mensagem.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function ensureSpace(doc: PDFKit.PDFDocument, minHeight: number) {
  if (doc.y + minHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 28);
  doc.moveDown(0.8);
  doc.fillColor("#12324a").font("Helvetica-Bold").fontSize(13).text(title, { underline: false });
  doc.moveDown(0.25);
}

function drawTableHeader(doc: PDFKit.PDFDocument) {
  ensureSpace(doc, 24);
  const startX = doc.page.margins.left;
  const y = doc.y;
  doc.roundedRect(startX, y, 520, 22, 6).fill("#e8eff5");
  doc.fillColor("#12324a").font("Helvetica-Bold").fontSize(9);
  doc.text("Data", startX + 8, y + 7, { width: 58 });
  doc.text("Conta", startX + 68, y + 7, { width: 140 });
  doc.text("Categoria", startX + 212, y + 7, { width: 90 });
  doc.text("Status", startX + 306, y + 7, { width: 70 });
  doc.text("Natureza", startX + 380, y + 7, { width: 60 });
  doc.text("Valor", startX + 445, y + 7, { width: 65, align: "right" });
  doc.y = y + 26;
}

function drawTransactionRow(doc: PDFKit.PDFDocument, transaction: ReportTransaction) {
  ensureSpace(doc, 24);
  const startX = doc.page.margins.left;
  const y = doc.y;
  doc.strokeColor("#d7e1ea").lineWidth(0.5).moveTo(startX, y + 19).lineTo(startX + 520, y + 19).stroke();

  doc.fillColor("#24323f").font("Helvetica").fontSize(9);
  doc.text(formatDate(transaction.vencimento || transaction.createdAt), startX + 8, y + 5, { width: 58 });
  doc.text(truncate(transaction.tipo, 28), startX + 68, y + 5, { width: 140 });
  doc.text(truncate(transaction.categoria, 18), startX + 212, y + 5, { width: 90 });
  doc.text(transaction.status, startX + 306, y + 5, { width: 70 });
  doc.text(transaction.natureza === "PAGAR" ? "Pagar" : "Receber", startX + 380, y + 5, { width: 60 });
  doc.font("Helvetica-Bold").text(formatCurrency(transaction.valor), startX + 445, y + 5, { width: 65, align: "right" });
  doc.y = y + 22;
}

function buildPdfBuffer(params: {
  title: string;
  client: {
    fullName: string;
    phone: string;
    email: string | null;
    plan: string;
    status: string;
  };
  toPay: ReportTransaction[];
  toReceive: ReportTransaction[];
  totalToPay: number;
  totalToReceive: number;
  finalBalance: number;
  totalEntries: number;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.rect(0, 0, doc.page.width, 118).fill("#12324a");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(22).text("ozapteconta", 36, 24);
    doc.font("Helvetica").fontSize(11).text(params.title, 36, 54);
    doc.font("Helvetica").fontSize(10).text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 36, 74);

    doc.roundedRect(36, 132, 523, 88, 12).fill("#f6f9fc");
    doc.fillColor("#12324a").font("Helvetica-Bold").fontSize(12).text("Dados do Cliente", 52, 148);
    doc.fillColor("#24323f").font("Helvetica").fontSize(10);
    doc.text(`Nome: ${params.client.fullName}`, 52, 172);
    doc.text(`Telefone: ${params.client.phone}`, 52, 188);
    doc.text(`E-mail: ${params.client.email || "não informado"}`, 280, 172);
    doc.text(`Plano: ${params.client.plan}  |  Status: ${params.client.status}`, 280, 188);

    doc.y = 240;
    doc.fillColor("#12324a").font("Helvetica-Bold").fontSize(14).text("Visão Geral", 36, doc.y);
    doc.moveDown(0.5);

    const cards = [
      { label: "A Pagar", value: formatCurrency(params.totalToPay), color: "#b93a32", x: 36 },
      { label: "A Receber", value: formatCurrency(params.totalToReceive), color: "#227a50", x: 214 },
      { label: "Resultado Final", value: formatCurrency(params.finalBalance), color: params.finalBalance >= 0 ? "#1d6fd6" : "#8f2f8c", x: 392 },
    ];

    const cardY = doc.y + 6;
    for (const card of cards) {
      doc.roundedRect(card.x, cardY, 166, 58, 10).fill("#f5f7fa");
      doc.fillColor(card.color).font("Helvetica-Bold").fontSize(10).text(card.label, card.x + 12, cardY + 12);
      doc.fontSize(15).text(card.value, card.x + 12, cardY + 29);
    }

    doc.y = cardY + 78;
    drawSectionTitle(doc, `Contas a Pagar (${params.toPay.length})`);
    drawTableHeader(doc);
    if (params.toPay.length === 0) {
      doc.fillColor("#516170").font("Helvetica-Oblique").fontSize(10).text("Nenhuma conta a pagar no período.");
      doc.moveDown(0.8);
    } else {
      for (const transaction of params.toPay) drawTransactionRow(doc, transaction);
    }

    drawSectionTitle(doc, `Contas a Receber (${params.toReceive.length})`);
    drawTableHeader(doc);
    if (params.toReceive.length === 0) {
      doc.fillColor("#516170").font("Helvetica-Oblique").fontSize(10).text("Nenhuma conta a receber no período.");
      doc.moveDown(0.8);
    } else {
      for (const transaction of params.toReceive) drawTransactionRow(doc, transaction);
    }

    ensureSpace(doc, 100);
    doc.moveDown(1);
    doc.roundedRect(36, doc.y, 523, 82, 12).fill("#eef4f8");
    const summaryY = doc.y;
    doc.fillColor("#12324a").font("Helvetica-Bold").fontSize(13).text("Fechamento do Relatório", 52, summaryY + 14);
    doc.fillColor("#24323f").font("Helvetica").fontSize(10);
    doc.text(`Total de registros: ${params.totalEntries}`, 52, summaryY + 38);
    doc.text(`Total a pagar: ${formatCurrency(params.totalToPay)}`, 220, summaryY + 38);
    doc.text(`Total a receber: ${formatCurrency(params.totalToReceive)}`, 380, summaryY + 38);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(params.finalBalance >= 0 ? "#227a50" : "#b93a32");
    doc.text(`Resultado final: ${formatCurrency(params.finalBalance)}`, 52, summaryY + 56);

    doc.end();
  });
}

async function generateFinancialReport(phone: string, period: ReportPeriod) {
  const client = await prisma.clientProfile.findUnique({
    where: { phone },
    select: {
      fullName: true,
      phone: true,
      email: true,
      plan: true,
      status: true,
    },
  });

  const range = getPeriodRange(period);
  const transactionsRaw = await prisma.financialTransaction.findMany({
    where: {
      userPhone: phone,
      OR: [
        { createdAt: { gte: range.start, lte: range.end } },
        { vencimento: { gte: range.start, lte: range.end } },
        { paidAt: { gte: range.start, lte: range.end } },
      ],
    },
    orderBy: [{ vencimento: "asc" }, { createdAt: "asc" }],
  });

  const transactions: ReportTransaction[] = transactionsRaw.map((item) => ({
    id: item.id,
    tipo: item.tipo,
    categoria: item.categoria,
    natureza: item.natureza,
    status: item.status,
    valor: item.valor.toNumber(),
    vencimento: item.vencimento,
    paidAt: item.paidAt,
    createdAt: item.createdAt,
  }));

  const toPay = transactions.filter((item) => item.natureza === "PAGAR");
  const toReceive = transactions.filter((item) => item.natureza === "RECEBER");
  const totalToPay = toPay.reduce((sum, item) => sum + item.valor, 0);
  const totalToReceive = toReceive.reduce((sum, item) => sum + item.valor, 0);
  const finalBalance = totalToReceive - totalToPay;

  const pdfBuffer = await buildPdfBuffer({
    title: range.title,
    client: {
      fullName: client?.fullName || phone,
      phone,
      email: client?.email || null,
      plan: client?.plan || "N/D",
      status: client?.status || "N/D",
    },
    toPay,
    toReceive,
    totalToPay,
    totalToReceive,
    finalBalance,
    totalEntries: transactions.length,
  });

  await fs.promises.mkdir(config.storage.reportsPath, { recursive: true });
  const safeName = (client?.fullName || phone).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const fileName = `ozapteconta-${range.fileTag}-${safeName || "cliente"}.pdf`;
  const filePath = path.join(config.storage.reportsPath, fileName);
  await fs.promises.writeFile(filePath, pdfBuffer);

  return {
    client,
    transactions,
    totalToPay,
    totalToReceive,
    finalBalance,
    pdfBuffer,
    fileName,
    filePath,
    title: range.title,
  };
}

export async function sendFinancialReportNow(phone: string, targetEmail?: string): Promise<{ success: boolean; message: string }> {
  const report = await generateFinancialReport(phone, "daily");
  const requestedEmail = targetEmail ? targetEmail.trim().toLowerCase() : null;
  const emailTo = requestedEmail || report.client?.email || null;
  const deliveryResults = { whatsapp: false, email: false };

  if (requestedEmail && !isValidEmailAddress(requestedEmail)) {
    return {
      success: false,
      message:
        `❌ O e-mail informado parece inválido: *${requestedEmail}*\n\n` +
        `Envie neste formato:\n` +
        `• _enviar pdf do resumo para email nome@dominio.com_\n\n` +
        `_Depois de receber corretamente, o envio leva alguns segundos._`,
    };
  }


  // Quando o usuário pede envio por e-mail explicitamente, prioriza e-mail
  // e evita confirmar entrega por WhatsApp antes do sucesso do SMTP.
  if (requestedEmail) {
    if (!isEmailConfigured()) {
      return {
        success: false,
        message:
          "⚠️ Recebi seu pedido de envio por e-mail, mas o serviço de e-mail está indisponível no momento. " +
          "Tente novamente em alguns instantes.",
      };
    }

    deliveryResults.email = await sendEmailWithAttachment({
      to: requestedEmail,
      subject: report.title,
      text: `Olá! Segue em anexo o seu ${report.title.toLowerCase()} do ozapteconta. Resultado final: ${formatCurrency(report.finalBalance)}.`,
      html: buildReportEmailHtml({
        recipientName: report.client?.fullName,
        title: report.title,
        result: formatCurrency(report.finalBalance),
        periodLabel: "relatorio diario",
      }),
      fileName: report.fileName,
      content: report.pdfBuffer,
    });

    if (!deliveryResults.email) {
      return {
        success: false,
        message:
          `⚠️ O relatório foi gerado, mas não consegui enviar para *${requestedEmail}* agora.\n` +
          `Confira se o e-mail está correto e tente novamente em alguns instantes.`,
      };
    }

    return {
      success: true,
      message:
        `📄 Relatório diário enviado com sucesso para *${requestedEmail}*.\n\n` +
        `Resultado final: *${formatCurrency(report.finalBalance)}*`,
    };
  }

  deliveryResults.whatsapp = await sendDocument(phone, {
    buffer: report.pdfBuffer,
    fileName: report.fileName,
    mimeType: "application/pdf",
    caption: `Seu relatório diário está pronto. Resultado final: ${formatCurrency(report.finalBalance)}.`,
  });
  if (emailTo && isEmailConfigured()) {
    deliveryResults.email = await sendEmailWithAttachment({
      to: emailTo,
      subject: report.title,
      text: `Olá! Segue em anexo o seu ${report.title.toLowerCase()} do ozapteconta. Resultado final: ${formatCurrency(report.finalBalance)}.`,
      html: `<p>Olá!</p><p>Segue em anexo o seu <strong>${report.title}</strong> do ozapteconta.</p><p><strong>Resultado final:</strong> ${formatCurrency(report.finalBalance)}</p>`,
      fileName: report.fileName,
      content: report.pdfBuffer,
    });
  }

  if (deliveryResults.whatsapp || deliveryResults.email) {
    const channels = [deliveryResults.whatsapp ? "WhatsApp" : null, deliveryResults.email ? "e-mail" : null].filter(Boolean).join(" e ");
    return {
      success: true,
      message: `📄 Relatório diário gerado com sucesso e enviado por ${channels}.\n\nResultado final: *${formatCurrency(report.finalBalance)}*`,
    };
  }

  return {
    success: false,
    message: "⚠️ O PDF foi gerado, mas não foi possível enviá-lo agora. Tente novamente em alguns instantes.",
  };
}

export async function processWeeklyFinancialReports(): Promise<{ sent: number; failed: number }> {
  const clients = await prisma.clientProfile.findMany({
    where: { status: "ACTIVE" },
    select: { phone: true, fullName: true, email: true },
  });

  let sent = 0;
  let failed = 0;

  for (const client of clients) {
    try {
      const report = await generateFinancialReport(client.phone, "weekly");
      let delivered = false;

      if (client.email && isEmailConfigured()) {
        delivered = await sendEmailWithAttachment({
          to: client.email,
          subject: report.title,
          text: `Olá, ${client.fullName}! Segue em anexo o seu relatório semanal do ozapteconta. Resultado final: ${formatCurrency(report.finalBalance)}.`,
          html: buildReportEmailHtml({
            recipientName: client.fullName,
            title: report.title,
            result: formatCurrency(report.finalBalance),
            periodLabel: "relatorio semanal",
          }),
          fileName: report.fileName,
          content: report.pdfBuffer,
        });
      }

      if (!delivered) {
        delivered = await sendDocument(client.phone, {
          buffer: report.pdfBuffer,
          fileName: report.fileName,
          mimeType: "application/pdf",
          caption: `Seu relatório semanal do ozapteconta está pronto. Resultado final: ${formatCurrency(report.finalBalance)}.`,
        });
      } else {
        await sendMessage(client.phone, "📄 Seu relatório semanal do ozapteconta foi enviado para o seu e-mail cadastrado.");
      }

      if (delivered) {
        sent++;
        logger.info(`[Reports] Relatório semanal entregue para ${client.phone}`);
      } else {
        failed++;
        logger.warn(`[Reports] Falha ao entregar relatório semanal para ${client.phone}`);
      }
    } catch (error) {
      failed++;
      logger.error(`[Reports] Erro ao gerar relatório semanal para ${client.phone}:`, error);
    }
  }

  return { sent, failed };
}