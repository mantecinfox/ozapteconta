import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";
import { config } from "../config";
import { normalizePhoneToE164, isValidBrazilianPhone } from "../services/whatsappHealthService";
import infinityPayService from "../services/infinityPayService";
import { authMiddleware, requireClient } from "../middleware/auth";
import { issueClientPortalAccess } from "../services/clientAccessService";
import { sendMessage } from "../services/whatsappService";

const router = Router();

function normalizeCpf(v: string) {
  return v.replace(/\D/g, "");
}

function normalizeZip(v: string) {
  return v.replace(/\D/g, "");
}

function parsePlan(v: string): "HOME" | "FULL" {
  const upper = String(v).toUpperCase();
  if (upper === "FULL") return "FULL";
  return "HOME"; // Padrão
}

async function getPortalBaseUrl() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "client_portal_base_url" } });
  return (setting?.value || config.frontendUrl || "http://localhost:5173").replace(/\/$/, "");
}

async function buildPortalLink(token: string) {
  const base = await getPortalBaseUrl();
  return `${base}/cliente/qr/${token}`;
}

function parseDateInput(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function daysDiff(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function reportFromTransactions(transactions: Array<any>) {
  const now = new Date();
  const receberAbertas = transactions.filter((t) => t.natureza === "RECEBER" && t.status !== "PAGO" && t.status !== "CANCELADO");
  const receberPagas = transactions.filter((t) => t.natureza === "RECEBER" && t.status === "PAGO");
  const pagar = transactions.filter((t) => t.natureza === "PAGAR");
  const pagarPagas = pagar.filter((t) => t.status === "PAGO");

  const agingBuckets = [
    { label: "1-15", min: 1, max: 15, count: 0, total: 0 },
    { label: "16-30", min: 16, max: 30, count: 0, total: 0 },
    { label: "31-60", min: 31, max: 60, count: 0, total: 0 },
    { label: "+60", min: 61, max: 99999, count: 0, total: 0 },
  ];

  const inadimplencia = receberAbertas
    .map((t) => {
      if (!t.vencimento) return null;
      const atraso = daysDiff(now, new Date(t.vencimento));
      if (atraso <= 0) return null;
      const valor = toNumber(t.valor);
      const multa = valor * 0.02;
      const juros = valor * 0.00033 * atraso;
      const faixa = agingBuckets.find((b) => atraso >= b.min && atraso <= b.max);
      if (faixa) {
        faixa.count += 1;
        faixa.total += valor;
      }
      return {
        id: t.id,
        tipo: t.tipo,
        categoria: t.categoria,
        vencimento: t.vencimento,
        diasAtraso: atraso,
        valorOriginal: valor,
        jurosCalculados: Number(juros.toFixed(2)),
        multaCalculada: Number(multa.toFixed(2)),
      };
    })
    .filter(Boolean);

  const recebimentosRealizados = receberPagas.map((t) => ({
    id: t.id,
    tipo: t.tipo,
    valorRecebido: toNumber(t.valor),
    descontoConcedido: 0,
    formaPagamento: "Não informado",
    contaDestino: "Não informada",
    recebidoEm: t.paidAt || t.updatedAt,
  }));

  const contasPagarPorFornecedorMap = new Map<string, { fornecedor: string; cnpjFornecedor: string | null; categoria: string; total: number; pendencias: number; proximosVencimentos: number; }>();
  for (const t of pagar) {
    const key = `${t.tipo}::${t.categoria || "Sem categoria"}`;
    const item = contasPagarPorFornecedorMap.get(key) || {
      fornecedor: t.tipo,
      cnpjFornecedor: null,
      categoria: t.categoria || "Sem categoria",
      total: 0,
      pendencias: 0,
      proximosVencimentos: 0,
    };
    item.total += toNumber(t.valor);
    if (t.status !== "PAGO" && t.status !== "CANCELADO") item.pendencias += 1;
    if (t.vencimento && new Date(t.vencimento) >= now) item.proximosVencimentos += 1;
    contasPagarPorFornecedorMap.set(key, item);
  }

  const entradasPrevistas = transactions
    .filter((t) => t.natureza === "RECEBER" && t.status !== "CANCELADO")
    .reduce((acc, t) => acc + toNumber(t.valor), 0);
  const saidasPrevistas = transactions
    .filter((t) => t.natureza === "PAGAR" && t.status !== "CANCELADO")
    .reduce((acc, t) => acc + toNumber(t.valor), 0);
  const entradasRealizadas = receberPagas.reduce((acc, t) => acc + toNumber(t.valor), 0);
  const saidasRealizadas = pagarPagas.reduce((acc, t) => acc + toNumber(t.valor), 0);

  const despesaCentroCustoMap = new Map<string, number>();
  for (const t of pagar) {
    const centro = t.categoria || "Outros";
    despesaCentroCustoMap.set(centro, (despesaCentroCustoMap.get(centro) || 0) + toNumber(t.valor));
  }
  const totalDespesas = Array.from(despesaCentroCustoMap.values()).reduce((a, b) => a + b, 0);

  const faturamentoTotal = receberPagas.reduce((acc, t) => acc + toNumber(t.valor), 0);
  const numeroVendas = receberPagas.length;
  const ticketMedio = numeroVendas > 0 ? faturamentoTotal / numeroVendas : 0;

  const variaveisKeywords = /(comiss|mat[ée]ria|insumo|frete|imposto)/i;
  const custosVariaveis = pagar.filter((t) => variaveisKeywords.test(`${t.tipo} ${t.categoria || ""}`));
  const totalCustosVariaveis = custosVariaveis.reduce((acc, t) => acc + toNumber(t.valor), 0);
  const margemContribuicao = faturamentoTotal > 0 ? (faturamentoTotal - totalCustosVariaveis) / faturamentoTotal : 0;

  const pmrBase = receberPagas.filter((t) => t.paidAt).map((t) => daysDiff(new Date(t.paidAt), new Date(t.createdAt)));
  const pmpBase = pagarPagas.filter((t) => t.paidAt).map((t) => daysDiff(new Date(t.paidAt), new Date(t.createdAt)));
  const pmr = pmrBase.length ? pmrBase.reduce((a, b) => a + b, 0) / pmrBase.length : 0;
  const pmp = pmpBase.length ? pmpBase.reduce((a, b) => a + b, 0) / pmpBase.length : 0;

  const receitaBruta = entriesSum(receberPagas);
  const cpv = totalCustosVariaveis;
  const despesasOperacionais = pagarPagas.reduce((acc, t) => acc + toNumber(t.valor), 0) - cpv;
  const ebitda = receitaBruta - cpv - despesasOperacionais;

  const balanceteMap = new Map<string, { conta: string; debitos: number; creditos: number; saldoAnterior: number; }>();
  for (const t of transactions) {
    const conta = t.categoria || "Outros";
    const item = balanceteMap.get(conta) || { conta, debitos: 0, creditos: 0, saldoAnterior: 0 };
    if (t.natureza === "PAGAR") item.debitos += toNumber(t.valor);
    if (t.natureza === "RECEBER") item.creditos += toNumber(t.valor);
    balanceteMap.set(conta, item);
  }

  return {
    contasReceber: {
      titulosEmAberto: receberAbertas.map((t) => ({
        id: t.id,
        clienteNome: t.user?.name || "Cliente",
        dataEmissao: t.createdAt,
        dataVencimento: t.vencimento,
        valorOriginal: toNumber(t.valor),
        saldoDevedor: toNumber(t.valor),
        status: t.status,
      })),
      inadimplenciaAging: {
        faixas: agingBuckets,
        itens: inadimplencia,
      },
      recebimentosRealizados,
    },
    contasPagar: {
      porFornecedor: Array.from(contasPagarPorFornecedorMap.values()),
      fluxoCaixaPrevistoVsRealizado: {
        saldoInicial: 0,
        entradasPrevistas: Number(entradasPrevistas.toFixed(2)),
        saidasPrevistas: Number(saidasPrevistas.toFixed(2)),
        entradasRealizadas: Number(entradasRealizadas.toFixed(2)),
        saidasRealizadas: Number(saidasRealizadas.toFixed(2)),
        saldoFinalProjetado: Number((entradasPrevistas - saidasPrevistas).toFixed(2)),
        saldoFinalRealizado: Number((entradasRealizadas - saidasRealizadas).toFixed(2)),
      },
      despesasPorCentroCusto: Array.from(despesaCentroCustoMap.entries()).map(([centroCusto, valor]) => ({
        centroCusto,
        valor: Number(valor.toFixed(2)),
        percentualSobreGastos: totalDespesas > 0 ? Number(((valor / totalDespesas) * 100).toFixed(2)) : 0,
      })),
    },
    kpis: {
      periodoAnalise: {
        inicio: transactions[transactions.length - 1]?.createdAt || null,
        fim: transactions[0]?.createdAt || null,
      },
      volumeTransacoes: transactions.length,
      receitaBruta: Number(faturamentoTotal.toFixed(2)),
      ticketMedio: Number(ticketMedio.toFixed(2)),
      margemContribuicao: Number((margemContribuicao * 100).toFixed(2)),
      pmrDias: Number(pmr.toFixed(1)),
      pmpDias: Number(pmp.toFixed(1)),
      idealPmpMaiorQuePmr: pmp >= pmr,
    },
    demonstrativos: {
      dre: {
        receitaBruta: Number(receitaBruta.toFixed(2)),
        deducoes: 0,
        cpv: Number(cpv.toFixed(2)),
        ebitda: Number(ebitda.toFixed(2)),
        lucroLiquido: Number(ebitda.toFixed(2)),
      },
      balanceteFinanceiro: Array.from(balanceteMap.values()).map((item) => ({
        ...item,
        saldoAtual: Number((item.creditos - item.debitos).toFixed(2)),
      })),
      conciliacaoBancaria: transactions
        .filter((t) => t.status === "PAGO")
        .map((t) => ({
          id: t.id,
          dataMovimento: t.paidAt || t.updatedAt,
          historico: t.tipo,
          valorSistema: toNumber(t.valor),
          valorBanco: toNumber(t.valor),
          conciliado: true,
        })),
    },
  };
}

function entriesSum(entries: Array<any>): number {
  return entries.reduce((acc, item) => acc + toNumber(item.valor), 0);
}

function buildWhatsappLink(phone: string, token: string, refCode: string) {
  const number = phone.replace(/\D/g, "");
  const text = encodeURIComponent(`Olá, quero ativar meu ozapteconta. TOKEN:${token} REF:${refCode}`);
  return `https://wa.me/${number}?text=${text}`;
}

// ─── Mensagem de boas-vindas completa (portal + pagamento + bot) ──────────────
function buildPortalWelcomeMessage(params: {
  clientName: string;
  planDisplayName: string;
  priceMonthly: number;
  paymentLinkUrl: string | null;
  portalLoginUrl: string;
  username: string;
  password: string;
  botPhone: string | null;
}): string {
  const { clientName, planDisplayName, priceMonthly, paymentLinkUrl, portalLoginUrl, username, password, botPhone } = params;

  const paymentSection = paymentLinkUrl
    ? `💳 *PAGAMENTO — 1º MÊS*\nClique no link abaixo para pagar via PIX, cartão ou boleto:\n${paymentLinkUrl}\n⏳ Prazo: 3 dias\n\nApós a confirmação, sua conta será ativada automaticamente! ✅`
    : `💳 *PAGAMENTO*\nNosso time enviará o link de pagamento em breve.\nValor: *R$ ${priceMonthly.toFixed(2)}/mês*`;

  const botSection = botPhone
    ? `📱 *SEU BOT FINANCEIRO*\nAdicione este número e comece a usar:\n📞 *${botPhone}*\n\nExemplos de uso:\n• "paguei conta de luz R$ 150"\n• "recebi aluguel R$ 1.200"\n• Pode enviar áudios também! 🎤`
    : `📱 *SEU BOT FINANCEIRO*\nEm breve você receberá o número do seu bot personalizado.`;

  return (
    `👋 *Bem-vindo(a) ao ozapteconta, ${clientName}!*\n` +
    `Seu cadastro foi realizado com sucesso! 🎉\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *SEU PLANO*\n` +
    `Plano: *${planDisplayName}*\n` +
    `Valor: *R$ ${priceMonthly.toFixed(2)}/mês*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${paymentSection}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🔐 *PORTAL DO CLIENTE*\n` +
    `Acesse seus relatórios financeiros:\n` +
    `🌐 ${portalLoginUrl}\n` +
    `👤 Usuário: *${username}*\n` +
    `🔑 Senha: *${password}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${botSection}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Dúvidas? Responda esta mensagem. 😊`
  );
}

async function chooseAccount(referenceCode?: string, assignedWhatsappAccountId?: number) {
  if (assignedWhatsappAccountId) {
    const fixed = await prisma.generatedWhatsappAccount.findFirst({
      where: { id: assignedWhatsappAccountId, isActive: true },
      include: { _count: { select: { clients: true } } },
    });

    if (fixed && fixed._count.clients < fixed.maxClients) {
      return fixed;
    }
  }

  if (referenceCode) {
    const byRef = await prisma.generatedWhatsappAccount.findFirst({
      where: { referenceCode: referenceCode.toUpperCase(), isActive: true },
      include: { _count: { select: { clients: true } } },
    });
    if (byRef && byRef._count.clients < byRef.maxClients) return byRef;
  }

  const pool = await prisma.generatedWhatsappAccount.findMany({
    where: { isActive: true },
    include: { _count: { select: { clients: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (!pool.length) return null;

  const available = pool.filter((acc: any) => acc._count.clients < acc.maxClients);
  if (!available.length) return null;

  return available.reduce((acc: any, cur: any) => (cur._count.clients < acc._count.clients ? cur : acc));
}

// Lista pública de contas ativas para seleção por referência
router.get("/options", async (_req: Request, res: Response) => {
  const accounts = await prisma.generatedWhatsappAccount.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      referenceCode: true,
      phone: true,
    },
  });

  res.json(accounts);
});

// Cadastro público do cliente
router.post("/register", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  try {
    const fullName = String(body.fullName || "").trim();
    const phone = normalizePhoneToE164(String(body.phone || ""));
    const email = String(body.email || "").trim().toLowerCase() || null;
    const cpf = normalizeCpf(String(body.cpf || ""));
    const addressStreet = String(body.addressStreet || "").trim();
    const addressNumber = String(body.addressNumber || "").trim();
    const addressComplement = String(body.addressComplement || "").trim() || null;
    const addressNeighborhood = String(body.addressNeighborhood || "").trim();
    const addressCity = String(body.addressCity || "").trim();
    const addressState = String(body.addressState || "").trim().toUpperCase();
    const addressZipCode = normalizeZip(String(body.addressZipCode || ""));
    const plan = parsePlan(String(body.plan || "HOME"));
    const referenceCode = String(body.referenceCode || "").trim().toUpperCase() || undefined;

    // Validar telefone
    if (!isValidBrazilianPhone(phone)) {
      res.status(400).json({
        error: "Número de telefone inválido. Use o formato +5511999999999",
        example: "+5511987654321",
      });
      return;
    }

    if (!fullName || !cpf || !addressStreet || !addressNumber || !addressNeighborhood || !addressCity || !addressState || !addressZipCode) {
      res.status(400).json({ error: "Preencha todos os campos obrigatórios" });
      return;
    }

    // Cliente não escolhe bot manualmente; o roteamento usa referência enviada pelo link/admin.
    const chosenAccount = await chooseAccount(referenceCode);
    if (!chosenAccount) {
      res.status(503).json({
        error: "Nenhuma conta WhatsApp disponível. O administrador precisa adicionar/ativar uma nova conta.",
      });
      return;
    }

    const created = await prisma.clientProfile.create({
      data: {
        fullName,
        phone,
        email,
        cpf,
        addressStreet,
        addressNumber,
        addressComplement,
        addressNeighborhood,
        addressCity,
        addressState,
        addressZipCode,
        plan,
        status: "PENDING_ACTIVATION",
        assignedWhatsappAccountId: chosenAccount?.id,
        primaryContext: "PESSOAL",
      },
    });

    const portalAccess = await issueClientPortalAccess(created.id, phone);

    // Obter dados do plano
    const planData = await prisma.subscriptionPlan.findUnique({
      where: { plan },
    });

    if (!planData) {
      throw new Error(`Plano ${plan} não encontrado`);
    }

    // Criar subscrição
    const subscription = await prisma.clientSubscription.create({
      data: {
        clientId: created.id,
        plan,
        priceMonthly: planData.priceMonthly,
        status: "PENDING",
        nextBillingDate: new Date(),
      },
    });

    // Criar cliente na InfinityPay
    const customerResult = await infinityPayService.createCustomer({
      email: email || phone,
      name: fullName,
      cpf,
      phone,
    });

    if (customerResult.success) {
      const customerId = customerResult.data?.id;
      await prisma.clientSubscription.update({
        where: { id: subscription.id },
        data: { infinityPayCustomerId: customerId },
      });
    }

    // Criar cobrança inicial — gerar link de pagamento (PIX / cartão / boleto)
    const pendingPayment = await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        amount: planData.priceMonthly,
        status: "PENDING",
        paymentMethod: "PIX",
        description: `${planData.displayName} - ozapteconta (1º mês)`,
      },
    });

    const linkResult = await infinityPayService.createPaymentLink({
      amount: Number(planData.priceMonthly),
      description: `${planData.displayName} - ozapteconta (1º mês)`,
      customer_email: email || phone,
      customer_name: fullName,
      customer_cpf: cpf,
      customer_phone: phone,
      payment_methods: ["pix", "credit_card", "boleto"],
      expires_in: 86400 * 3, // 3 dias
      metadata: {
        subscription_id: subscription.id,
        client_id: created.id,
        payment_id: pendingPayment.id,
        plan,
        initial: true,
      },
    });

    let paymentLinkUrl: string | null = null;

    if (linkResult.success) {
      paymentLinkUrl = linkResult.data?.resolved_url || linkResult.data?.url || null;

      await prisma.payment.update({
        where: { id: pendingPayment.id },
        data: {
          infinityPayTransactionId: linkResult.data?.id,
        },
      });

      await prisma.paymentLog.create({
        data: {
          paymentId: pendingPayment.id,
          action: "payment_link_created",
          details: linkResult.data,
        },
      });

      logger.info(`[ClientPortal] Payment link gerado para ${fullName}: ${paymentLinkUrl}`);
    } else {
      await prisma.payment.update({
        where: { id: pendingPayment.id },
        data: {
          status: "FAILED",
          failureReason: linkResult.error || "Falha ao criar link de pagamento",
        },
      });
      logger.warn(`[ClientPortal] Falha ao criar payment link para cliente ${created.id}: ${linkResult.error}`);
    }

    // Enviar mensagem de boas-vindas completa via WhatsApp
    const frontendBase = (config.frontendUrl || "http://localhost:5173").replace(/\/$/, "");
    const botPhone = chosenAccount?.phone || null;

    let paymentLinkMessageSent = false;
    if (paymentLinkUrl) {
      const paymentMsg =
        `💳 *LINK DE PAGAMENTO*\n` +
        `Olá, ${fullName}! Seu link para ativação do ozapteconta já está pronto:\n` +
        `${paymentLinkUrl}\n\n` +
        `Após a confirmação do pagamento, sua conta será ativada automaticamente.`;

      paymentLinkMessageSent = await sendMessage(phone, paymentMsg);
      if (!paymentLinkMessageSent) {
        logger.warn(`[ClientPortal] Não foi possível enviar mensagem dedicada com link de pagamento para ${phone}`);
      }
    }

    const welcomeMsg = buildPortalWelcomeMessage({
      clientName: fullName,
      planDisplayName: planData.displayName,
      priceMonthly: Number(planData.priceMonthly),
      paymentLinkUrl,
      portalLoginUrl: `${frontendBase}/cliente/login`,
      username: portalAccess.username,
      password: portalAccess.password,
      botPhone,
    });

    const wppSent = await sendMessage(phone, welcomeMsg);
    if (!wppSent) {
      logger.warn(`[ClientPortal] Mensagem de boas-vindas não pôde ser enviada para ${phone}`);
    }

    const portalLink = await buildPortalLink(created.qrToken);
    const whatsappLink = chosenAccount
      ? buildWhatsappLink(chosenAccount.phone ?? "", created.qrToken, chosenAccount.referenceCode)
      : null;

    res.status(201).json({
      id: created.id,
      qrToken: created.qrToken,
      qrLink: portalLink,
      portalLink,
      whatsappLink,
      paymentLinkUrl,
      plan: {
        name: plan,
        displayName: planData.displayName,
        price: planData.priceMonthly,
      },
      subscription: {
        id: subscription.id,
        status: subscription.status,
        nextBillingDate: subscription.nextBillingDate,
      },
      assignedWhatsappAccount: chosenAccount
        ? {
            id: chosenAccount.id,
            label: chosenAccount.label,
            phone: chosenAccount.phone,
            referenceCode: chosenAccount.referenceCode,
          }
        : null,
      status: created.status,
      portalAccess,
      paymentLinkMessageSent,
      welcomeMessageSent: wppSent,
      message: paymentLinkUrl
        ? "Cadastro realizado! Link de pagamento e credenciais enviados via WhatsApp."
        : "Cadastro realizado! Credenciais enviadas via WhatsApp. Link de pagamento será enviado em breve.",
    });
  } catch (err) {
    logger.error("[ClientPortal] Erro no cadastro", err);
    res.status(500).json({ error: "Erro ao cadastrar cliente" });
  }
});

// Login do cliente para portal web (somente leitura)
router.post("/auth/login", async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "Login e senha são obrigatórios" });
    return;
  }

  const client = await prisma.clientProfile.findUnique({
    where: { portalUsername: username.trim() },
  });

  if (!client || !client.portalPasswordHash || !client.portalAccessEnabled) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const ok = await bcrypt.compare(password, client.portalPasswordHash);
  if (!ok) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  await prisma.clientProfile.update({
    where: { id: client.id },
    data: { portalLastLogin: new Date() },
  });

  const token = jwt.sign(
    { id: String(client.id), username: client.portalUsername, role: "CLIENT" },
    config.jwt.secret,
    { expiresIn: "30d" }
  );

  res.json({
    token,
    user: {
      id: String(client.id),
      username: client.portalUsername,
      name: client.fullName,
      role: "CLIENT",
      plan: client.plan,
    },
  });
});

router.get("/auth/me", authMiddleware, requireClient, async (req: Request, res: Response) => {
  const clientId = Number(req.admin?.id);
  const client = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      plan: true,
      status: true,
      createdAt: true,
    },
  });

  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  res.json({ client });
});

router.get("/reports", authMiddleware, requireClient, async (req: Request, res: Response) => {
  const clientId = Number(req.admin?.id);
  const client = await prisma.clientProfile.findUnique({ where: { id: clientId } });
  if (!client) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  const from = parseDateInput(String(req.query.from || ""));
  const to = parseDateInput(String(req.query.to || ""));
  const status = String(req.query.status || "").trim().toUpperCase();
  const natureza = String(req.query.natureza || "").trim().toUpperCase();
  const categoria = String(req.query.categoria || "").trim();
  const context = String(req.query.context || "").trim().toUpperCase();
  const search = String(req.query.search || "").trim();

  const where: Record<string, unknown> = {
    userPhone: client.phone,
  };

  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }
  if (status) where.status = status;
  if (natureza) where.natureza = natureza;
  if (context) where.context = context;
  if (categoria) where.categoria = { contains: categoria, mode: "insensitive" };
  if (search) {
    where.OR = [
      { tipo: { contains: search, mode: "insensitive" } },
      { categoria: { contains: search, mode: "insensitive" } },
      { rawMessage: { contains: search, mode: "insensitive" } },
    ];
  }

  const transactions = await prisma.financialTransaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true } },
    },
  });

  const report = reportFromTransactions(transactions);

  res.json({
    client: {
      id: client.id,
      fullName: client.fullName,
      plan: client.plan,
      status: client.status,
    },
    filters: {
      from: from?.toISOString() || null,
      to: to?.toISOString() || null,
      status: status || null,
      natureza: natureza || null,
      categoria: categoria || null,
      context: context || null,
      search: search || null,
    },
    totalRegistros: transactions.length,
    report,
    transactions,
  });
});

// GET /client-portal/transactions — transações do cliente autenticado
router.get("/transactions", authMiddleware, requireClient, async (req: Request, res: Response) => {
  const clientId = Number(req.admin?.id);
  const client = await prisma.clientProfile.findUnique({ where: { id: clientId }, select: { phone: true } });
  if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }

  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.min(50, parseInt(String(req.query.limit || "20"), 10));
  const skip = (page - 1) * limit;
  const status = String(req.query.status || "").trim().toUpperCase() || undefined;
  const natureza = String(req.query.natureza || "").trim().toUpperCase() || undefined;
  const search = String(req.query.search || "").trim() || undefined;
  const from = String(req.query.from || "").trim() || undefined;
  const to = String(req.query.to || "").trim() || undefined;

  const where: Record<string, unknown> = { userPhone: client.phone };
  if (status) where.status = status;
  if (natureza) where.natureza = natureza;
  if (search) where.tipo = { contains: search, mode: "insensitive" };
  if (from || to) where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to + "T23:59:59Z") } : {}) };

  try {
    const [transactions, total] = await Promise.all([
      prisma.financialTransaction.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: "desc" },
        select: { id: true, tipo: true, valor: true, natureza: true, categoria: true, status: true, context: true, fonte: true, vencimento: true, paidAt: true, notes: true, createdAt: true },
      }),
      prisma.financialTransaction.count({ where }),
    ]);
    res.json({ transactions, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error("[ClientPortal] Erro em /transactions:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// GET /client-portal/audios — áudios do cliente autenticado
router.get("/audios", authMiddleware, requireClient, async (req: Request, res: Response) => {
  const clientId = Number(req.admin?.id);
  const client = await prisma.clientProfile.findUnique({ where: { id: clientId }, select: { phone: true } });
  if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }

  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.min(50, parseInt(String(req.query.limit || "20"), 10));
  const skip = (page - 1) * limit;

  try {
    const [audios, total] = await Promise.all([
      prisma.audioMessage.findMany({
        where: { userPhone: client.phone },
        skip, take: limit,
        orderBy: { createdAt: "desc" },
        select: { id: true, storageKey: true, storageUrl: true, durationSeconds: true, mimeType: true, reviewed: true, createdAt: true, transaction: { select: { id: true, tipo: true, valor: true, natureza: true, status: true } } },
      }),
      prisma.audioMessage.count({ where: { userPhone: client.phone } }),
    ]);
    res.json({ audios, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error("[ClientPortal] Erro em /audios:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});


router.get("/:token/reports", async (req: Request, res: Response) => {
  const token = String(req.params.token || "");

  const client = await prisma.clientProfile.findUnique({ where: { qrToken: token } });
  if (!client) {
    res.status(404).json({ error: "Token inválido" });
    return;
  }

  const transactions = await prisma.financialTransaction.findMany({
    where: { userPhone: client.phone },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const totals = transactions.reduce(
    (acc, t) => {
      const value = Number(t.valor);
      if (t.natureza === "PAGAR") acc.totalPagar += value;
      if (t.natureza === "RECEBER") acc.totalReceber += value;
      if (t.status === "PAGO" && t.natureza === "PAGAR") acc.pagos += value;
      if (t.status === "PAGO" && t.natureza === "RECEBER") acc.recebidos += value;
      return acc;
    },
    { totalPagar: 0, totalReceber: 0, pagos: 0, recebidos: 0 }
  );

  res.json({
    client: {
      id: client.id,
      fullName: client.fullName,
      plan: client.plan,
      status: client.status,
    },
    metrics: {
      totalPagar: totals.totalPagar,
      totalReceber: totals.totalReceber,
      saldoProjetado: totals.totalReceber - totals.totalPagar,
      pagos: totals.pagos,
      recebidos: totals.recebidos,
      totalLancamentos: transactions.length,
    },
    transactions,
  });
});

// Buscar dados públicos por token
router.get("/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token || "");
  const client = await prisma.clientProfile.findUnique({
    where: { qrToken: token },
    include: { assignedWhatsappAccount: true },
  });

  if (!client) {
    res.status(404).json({ error: "Token inválido" });
    return;
  }

  const portalLink = await buildPortalLink(token);
  const whatsappLink = client.assignedWhatsappAccount
    ? buildWhatsappLink(client.assignedWhatsappAccount.phone ?? "", token, client.assignedWhatsappAccount.referenceCode)
    : null;

  res.json({
    id: client.id,
    fullName: client.fullName,
    plan: client.plan,
    status: client.status,
    qrToken: client.qrToken,
    qrLink: portalLink,
    portalLink,
    whatsappLink,
    assignedWhatsappAccount: client.assignedWhatsappAccount
      ? {
          id: client.assignedWhatsappAccount.id,
          label: client.assignedWhatsappAccount.label,
          phone: client.assignedWhatsappAccount.phone,
          referenceCode: client.assignedWhatsappAccount.referenceCode,
        }
      : null,
  });
});

// Ativação manual após leitura do QR
router.post("/:token/activate", async (req: Request, res: Response) => {
  const token = String(req.params.token || "");

  try {
    const updated = await prisma.clientProfile.update({
      where: { qrToken: token },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
      },
    });

    res.json({ success: true, status: updated.status });
  } catch (err) {
    logger.error("[ClientPortal] Erro ao ativar cliente", err);
    res.status(400).json({ error: "Token inválido para ativação" });
  }
});

export default router;
