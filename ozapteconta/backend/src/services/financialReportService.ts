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

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildReportEmailHtml(params: {
  recipientName?: string | null;
  title: string;
  periodLabel: string;
  totalToPay: number;
  totalToReceive: number;
  finalBalance: number;
  transactionCount?: number;
  fileName?: string;
}): string {
  const firstName = (params.recipientName || "").trim().split(" ")[0] || "";
  const greeting = firstName ? `Olá, ${escapeHtml(firstName)}!` : "Olá!";
  const isPositive = params.finalBalance >= 0;
  const balanceColor = isPositive ? "#1f7a4d" : "#b93a32";
  const balanceLabel = isPositive ? "Saldo positivo" : "Saldo negativo";
  const balanceArrow = isPositive ? "▲" : "▼";

  const totalToPay = formatCurrency(params.totalToPay || 0);
  const totalToReceive = formatCurrency(params.totalToReceive || 0);
  const finalBalance = formatCurrency(params.finalBalance || 0);
  const txCount = typeof params.transactionCount === "number" ? params.transactionCount : null;
  const title = escapeHtml(params.title);
  const periodLabel = escapeHtml(params.periodLabel);
  const safeFileName = params.fileName ? escapeHtml(params.fileName) : "";
  const panelUrl = config.frontendUrl;

  const preheader = `${params.periodLabel} • Resultado final: ${finalBalance}`;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${title}</title>
    <!--[if mso]>
      <style type="text/css">body,table,td,div,p,a{font-family:Arial,Helvetica,sans-serif !important;}</style>
    <![endif]-->
  </head>
  <body style="margin:0;padding:0;background:#eef2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#eef2f8;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f8;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #d9e2ee;box-shadow:0 12px 32px rgba(11,18,32,.06);">

            <!-- Header -->
            <tr>
              <td style="padding:0;background:#0b1220;background:linear-gradient(135deg,#0b1220 0%,#12324a 55%,#1d4ed8 100%);color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding:28px 32px 24px 32px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td valign="middle" style="padding-right:12px;">
                            <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#60a5fa,#22d3ee);text-align:center;line-height:40px;font-size:20px;font-weight:800;color:#0b1220;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">oz</div>
                          </td>
                          <td valign="middle">
                            <div style="font-size:22px;font-weight:800;letter-spacing:.2px;line-height:1;">ozapteconta</div>
                            <div style="margin-top:4px;font-size:12px;opacity:.78;letter-spacing:.3px;">Inteligência financeira no WhatsApp</div>
                          </td>
                        </tr>
                      </table>
                      <div style="margin-top:22px;display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#dbeafe;">
                        ${periodLabel}
                      </div>
                      <div style="margin-top:14px;font-size:22px;font-weight:700;line-height:1.25;color:#ffffff;">${title}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Greeting -->
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <p style="margin:0 0 8px 0;font-size:18px;font-weight:600;color:#0f172a;line-height:1.4;">${greeting}</p>
                <p style="margin:0;font-size:14px;line-height:1.65;color:#475569;">
                  Seu relatório financeiro está pronto. Preparamos um resumo executivo abaixo
                  e anexamos o documento completo em PDF para você consultar quando quiser.
                </p>
              </td>
            </tr>

            <!-- Hero balance card -->
            <tr>
              <td style="padding:20px 32px 8px 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0b1220;background:linear-gradient(135deg,#0f172a 0%,#12324a 100%);border-radius:16px;">
                  <tr>
                    <td style="padding:22px 24px;">
                      <div style="font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#93c5fd;">Resultado final do período</div>
                      <div style="margin-top:10px;font-size:34px;font-weight:800;color:#ffffff;line-height:1.1;letter-spacing:-.5px;">${finalBalance}</div>
                      <div style="margin-top:10px;">
                        <span style="display:inline-block;padding:5px 10px;border-radius:999px;background:${isPositive ? "rgba(34,197,94,.18)" : "rgba(239,68,68,.18)"};color:${isPositive ? "#86efac" : "#fca5a5"};font-size:12px;font-weight:600;">
                          ${balanceArrow} ${balanceLabel}
                        </span>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- KPI cards -->
            <tr>
              <td style="padding:16px 24px 8px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="50%" valign="top" style="padding:8px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fff5f3;border:1px solid #fbd5cd;border-radius:14px;">
                        <tr>
                          <td style="padding:16px 18px;">
                            <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#b93a32;">A pagar</div>
                            <div style="margin-top:8px;font-size:20px;font-weight:800;color:#7f1d1d;line-height:1.2;">${totalToPay}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td width="50%" valign="top" style="padding:8px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:14px;">
                        <tr>
                          <td style="padding:16px 18px;">
                            <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1f7a4d;">A receber</div>
                            <div style="margin-top:8px;font-size:20px;font-weight:800;color:#065f46;line-height:1.2;">${totalToReceive}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${txCount !== null ? `
            <tr>
              <td style="padding:0 32px 4px 32px;">
                <div style="font-size:12px;color:#64748b;line-height:1.6;">
                  <strong style="color:#0f172a;">${txCount}</strong> ${txCount === 1 ? "lançamento contabilizado" : "lançamentos contabilizados"} neste período.
                </div>
              </td>
            </tr>` : ""}

            <!-- PDF callout -->
            <tr>
              <td style="padding:20px 32px 8px 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fbff;border:1px solid #d7e6fb;border-radius:14px;">
                  <tr>
                    <td valign="middle" style="padding:16px 18px;width:48px;">
                      <div style="width:40px;height:40px;border-radius:10px;background:#1d4ed8;color:#ffffff;text-align:center;line-height:40px;font-size:18px;font-weight:800;">PDF</div>
                    </td>
                    <td valign="middle" style="padding:16px 18px 16px 4px;">
                      <div style="font-size:14px;font-weight:700;color:#0f172a;line-height:1.3;">Relatório completo em anexo</div>
                      <div style="margin-top:4px;font-size:12px;color:#475569;line-height:1.5;">
                        ${safeFileName ? safeFileName : "Documento PDF com todos os lançamentos detalhados."}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td align="center" style="padding:24px 32px 8px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" style="border-radius:12px;background:#1d4ed8;background:linear-gradient(135deg,#1d4ed8,#2563eb);">
                      <a href="${panelUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;letter-spacing:.2px;">
                        Acessar meu painel →
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Tips -->
            <tr>
              <td style="padding:8px 32px 28px 32px;">
                <div style="margin-top:12px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;">Próximos passos</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:10px;">
                  <tr>
                    <td style="padding:6px 0;font-size:13px;line-height:1.6;color:#334155;">
                      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#1d4ed8;vertical-align:middle;margin-right:8px;"></span>
                      Confira o PDF anexo e valide os lançamentos do período.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;line-height:1.6;color:#334155;">
                      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22d3ee;vertical-align:middle;margin-right:8px;"></span>
                      Envie novas contas pelo WhatsApp — texto, foto ou áudio.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;line-height:1.6;color:#334155;">
                      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#86efac;vertical-align:middle;margin-right:8px;"></span>
                      Acompanhe gráficos e tendências no painel web.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:20px 32px 24px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td>
                      <div style="font-size:13px;font-weight:700;color:#0f172a;">ozapteconta</div>
                      <div style="margin-top:4px;font-size:11px;color:#64748b;line-height:1.6;">
                        Seu controle financeiro inteligente via WhatsApp.<br/>
                        Este e-mail foi enviado automaticamente. Se tiver dúvidas, basta respondê-lo.
                      </div>
                      <div style="margin-top:12px;font-size:11px;color:#94a3b8;">
                        © ${new Date().getFullYear()} ozapteconta • Todos os direitos reservados
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>
          <div style="max-width:640px;margin:14px auto 0 auto;font-size:11px;color:#94a3b8;text-align:center;line-height:1.6;">
            Você está recebendo este e-mail porque é cliente ozapteconta.
          </div>
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
        periodLabel: "Relatório diário",
        totalToPay: report.totalToPay,
        totalToReceive: report.totalToReceive,
        finalBalance: report.finalBalance,
        transactionCount: report.transactions.length,
        fileName: report.fileName,
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
      html: buildReportEmailHtml({
        recipientName: report.client?.fullName,
        title: report.title,
        periodLabel: "Relatório diário",
        totalToPay: report.totalToPay,
        totalToReceive: report.totalToReceive,
        finalBalance: report.finalBalance,
        transactionCount: report.transactions.length,
        fileName: report.fileName,
      }),
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
            periodLabel: "Relatório semanal",
            totalToPay: report.totalToPay,
            totalToReceive: report.totalToReceive,
            finalBalance: report.finalBalance,
            transactionCount: report.transactions.length,
            fileName: report.fileName,
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