import { PrismaClient, AiProvider } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed do banco de dados...");

  // Admin user padrão
  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.adminUser.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash,
      name: "Administrador",
      role: "ADMIN",
    },
  });
  console.log("✅ Usuário admin criado (admin / admin123)");

  // Configuração WhatsApp inicial
  const wppCount = await prisma.whatsappConfig.count();
  if (wppCount === 0) {
    await prisma.whatsappConfig.create({
      data: {
        verifyToken: "meu_verify_token_secreto",
        enabled: false,
      },
    });
  }
  console.log("✅ Configuração WhatsApp criada");

  // Provedores de IA
  const providers: Array<{
    provider: AiProvider;
    displayName: string;
    model: string;
    enabled: boolean;
    isDefault: boolean;
    apiUrl?: string;
  }> = [
    { provider: "OPENAI", displayName: "OpenAI / ChatGPT", model: "gpt-4o-mini", enabled: false, isDefault: false },
    { provider: "GEMINI", displayName: "Google Gemini", model: "gemini-2.5-flash", enabled: true, isDefault: true },
    { provider: "GROQ", displayName: "Groq (Ultra Rápido)", model: "llama-3.1-8b-instant", enabled: false, isDefault: false },
    { provider: "GROK", displayName: "Grok (xAI)", model: "grok-2-latest", enabled: false, isDefault: false },
    { provider: "OLLAMA", displayName: "Ollama (Local)", model: "hermes3:8b", enabled: false, isDefault: false, apiUrl: "http://localhost:11434" },
    { provider: "ABACUS", displayName: "Abacus AI / RouteLLM", model: "gpt-4o-mini", enabled: false, isDefault: false, apiUrl: "https://routellm.abacus.ai" },
  ];

  for (const p of providers) {
    await prisma.aiProviderConfig.upsert({
      where: { provider: p.provider },
      update: {
        displayName: p.displayName,
        model: p.model,
        apiUrl: p.apiUrl,
        enabled: p.enabled,
        isDefault: p.isDefault,
      },
      create: p,
    });
  }
  console.log("✅ Provedores de IA configurados");

  // Configurações do sistema
  const settings = [
    { key: "reminder_enabled", value: "true" },
    { key: "reminder_days_before", value: "3" },
    { key: "reminder_time_hour", value: "9" },
    { key: "app_name", value: "FinanceBot" },
    { key: "app_version", value: "1.0.0" },
    { key: "client_whatsapp_number", value: "5500000000000" },
    { key: "client_portal_base_url", value: "http://localhost:5173" },
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log("✅ Configurações do sistema criadas");

  // Contas WhatsApp Oficiais (Meta Business API)
  await prisma.officialWhatsappAccount.upsert({
    where: { phone: "+5511999999999" },
    update: {
      label: "Conta Oficial Principal",
      isActive: true,
    },
    create: {
      label: "Conta Oficial Principal",
      businessAccountId: "123456789012345",
      phoneNumberId: "987654321098765",
      phone: "+5511999999999",
      accessToken: "EAAn...seu_token_aqui_para_producao...",
      webhookVerifyToken: "seu_verify_token_aqui",
      webhookSecret: "seu_webhook_secret_aqui",
      maxClientsSupported: 1000,
      notes: "Conta oficial da Meta Business API - conectar em produção",
    },
  });
  console.log("✅ Conta WhatsApp Oficial criada (+5511999999999)");

  // Contas WhatsApp Geradas (QR Code)
  await prisma.generatedWhatsappAccount.upsert({
    where: { referenceCode: "WA-DEMO-001" },
    update: {
      label: "Demo - Conta Teste",
      isActive: true,
    },
    create: {
      label: "Demo - Conta Teste",
      phone: "+5511988888888",
      referenceCode: "WA-DEMO-001",
      connectionType: "LOCAL",
      maxClients: 500,
      notes: "Conta de teste para demonstração - escaneie QR Code para conectar",
    },
  });
  console.log("✅ Conta WhatsApp Gerada (QR Code) criada (WA-DEMO-001)");

  const knowledgeEntries = [
    {
      title: "Contas essenciais da casa",
      keywords: "luz,energia,agua,saneamento,gas,internet,telefone,aluguel,condominio",
      content: "Contas essenciais incluem energia, água, gás, internet, telefone, aluguel e condomínio. Registre sempre valor, vencimento e categoria para projeção de saldo.",
      priority: 10,
    },
    {
      title: "Impostos comuns no Brasil",
      keywords: "iptu,ipva,darf,inss,ir,irpf,mei,simples,iss,icms",
      content: "Impostos comuns: IPTU (imóvel), IPVA (veículo), DARF/IRPF, INSS, DAS/MEI, ISS e ICMS. Sempre valide competência, vencimento e código de arrecadação antes do pagamento.",
      priority: 20,
    },
    {
      title: "Boas práticas financeiras",
      keywords: "reserva,emergencia,orcamento,planejamento,saldo,dividas,juros",
      content: "Mantenha orçamento mensal, reserva de emergência e priorize quitação de dívidas com juros altos. Compare total a pagar x total a receber para evitar saldo negativo recorrente.",
      priority: 30,
    },
    {
      title: "Análise nutricional de alimentos",
      keywords: "calorias,caloria,kcal,comida,alimento,saudavel,saudável,dieta,proteina,carboidrato,gordura,refeicao,refeição,lanche",
      content: "Posso analisar alimentos e refeições por texto ou áudio, estimando calorias, avaliando se o consumo parece saudável, o que é ideal ou não ideal, frequência sugerida e se vale consumir em pequenas quantidades. Para respostas melhores, informe alimento, preparo e quantidade aproximada.",
      priority: 40,
    },
  ];

  for (const k of knowledgeEntries) {
    await prisma.botKnowledgeEntry.upsert({
      where: { id: knowledgeEntries.indexOf(k) + 1 },
      update: {
        title: k.title,
        keywords: k.keywords,
        content: k.content,
        enabled: true,
        priority: k.priority,
      },
      create: {
        title: k.title,
        keywords: k.keywords,
        content: k.content,
        enabled: true,
        priority: k.priority,
      },
    });
  }
  console.log("✅ Base de conhecimento inicial criada");

  // Planos de subscrição
  const plans = [
    {
      plan: "HOME",
      displayName: "Básico",
      description: "Plano básico: contas a pagar e a receber para pessoa física e empresa. Recursos avançados (FIPE e mercado financeiro) indisponíveis.",
      priceMonthly: "4.90",
      allowedContexts: '["PESSOAL", "COMERCIAL"]',
      maxCategories: 20,
      maxTransactions: 1000,
      maxUsers: 1,
      supportLevel: "email" as const,
    },
    {
      plan: "OFFICE",
      displayName: "Legacy Office",
      description: "Plano legado. Não disponível para novas vendas.",
      priceMonthly: "4.90",
      allowedContexts: '["PESSOAL", "COMERCIAL"]',
      maxCategories: 20,
      maxTransactions: 1000,
      maxUsers: 1,
      supportLevel: "email" as const,
    },
    {
      plan: "FULL",
      displayName: "Completo",
      description: "Completo: gerencie contas pessoais e comerciais em uma única plataforma. Ideal para autônomos e empreendedores.",
      priceMonthly: "9.90",
      allowedContexts: '["PESSOAL", "COMERCIAL"]',
      maxCategories: 50,
      maxTransactions: 5000,
      maxUsers: 2,
      supportLevel: "priority" as const,
    },
  ];

  for (const p of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { plan: p.plan as any },
      update: {
        displayName: p.displayName,
        description: p.description,
        priceMonthly: p.priceMonthly,
        allowedContexts: p.allowedContexts,
        maxCategories: p.maxCategories,
        maxTransactions: p.maxTransactions,
        maxUsers: p.maxUsers,
        supportLevel: p.supportLevel,
      },
      create: p as any,
    });
  }
  console.log("✅ Planos de subscrição atualizados (Basico R$4,90 e Completo R$9,90; Office legado)");

  // Categorias de despesas PESSOAL (Home / Full)
  const personalCategories = [
    { name: "Alimentação e Mercado",          icon: "🛒", color: "#FFB347", description: "supermercado,feira,açougue,peixaria,padaria,hortifrúti,laticínios,congelados,enlatados,bebidas" },
    { name: "Refeições Fora / Delivery",       icon: "🍕", color: "#FF8C42", description: "restaurante,lanchonete,fast-food,delivery,pizzaria,sushi,cafeteria,sorveteria,bar,boteco,hamburguer,frango,marmita,self-service" },
    { name: "Moradia",                         icon: "🏠", color: "#FF6B6B", description: "aluguel,financiamento,IPTU,imóvel,apartamento,casa,prestação" },
    { name: "Condomínio",                      icon: "🏢", color: "#E74C3C", description: "condomínio,taxa de condomínio,fundo de reserva,portaria" },
    { name: "Energia Elétrica",                icon: "💡", color: "#FFD93D", description: "conta de luz,energia,CPFL,Enel,Cemig,Elektro,Coelba,Celpe,CEMIG,COPEL,watt" },
    { name: "Água e Saneamento",               icon: "💧", color: "#6BCB77", description: "conta de água,esgoto,SABESP,SANEPAR,Corsan,saneamento,caixa dágua" },
    { name: "Gás",                             icon: "🔥", color: "#FF8000", description: "gás de cozinha,botijão,GLP,gás encanado,gás natural,troca de botijão" },
    { name: "Internet e Telefone",             icon: "📱", color: "#4D96FF", description: "internet,banda larga,fibra,telefone fixo,telefone celular,plano móvel,recarga,tim,vivo,claro,oi,net,operadora" },
    { name: "Assinaturas e Streaming",         icon: "📺", color: "#9B59B6", description: "netflix,amazon prime,disney,hbo,globoplay,spotify,deezer,apple music,youtube premium,apple tv,paramount,star+,crunchyroll,mubi,antena,tv por assinatura,canais" },
    { name: "Limpeza e Conservação",           icon: "🧹", color: "#1ABC9C", description: "detergente,desinfetante,água sanitária,sabão,amaciante,vassoura,rodo,esponja,pano,balde,faxineira,diarista,desinsetização,dedetização,caixa dágua" },
    { name: "Vestuário e Calçados",            icon: "👕", color: "#E91E63", description: "roupa,calça,camisa,vestido,shorts,tênis,sapato,sandália,chinelo,meia,cueca,calcinha,sutiã,casaco,jaqueta,moletom,moda,loja de roupa,roupas,camiseta" },
    { name: "Higiene e Beleza",                icon: "💄", color: "#FF69B4", description: "shampoo,condicionador,sabonete,pasta de dente,fio dental,desodorante,perfume,maquiagem,creme,protetor solar,esmalte,hidratante,salão,cabeleireiro,manicure,depilação,barbearia" },
    { name: "Transporte",                      icon: "🚗", color: "#8B44AD", description: "gasolina,etanol,diesel,GNV,uber,99,táxi,ônibus,metrô,trem,passagem,combustível,estacionamento,pedágio,IPVA,licenciamento,seguro do carro,manutenção do carro,troca de óleo,pneu,lava jato,guincho,multa de trânsito" },
    { name: "Saúde e Bem-estar",               icon: "⚕️", color: "#E74C3C", description: "plano de saúde,médico,consulta,dentista,odontológico,farmácia,remédio,medicamento,exame,raio-x,ultrassom,academia,pilates,yoga,fisioterapia,psicólogo,terapia,óculos,lente de contato,suplemento,whey,creatina,vitamina" },
    { name: "Educação",                        icon: "📚", color: "#3498DB", description: "escola,mensalidade escolar,faculdade,universidade,curso,inglês,idioma,udemy,material escolar,livro,apostila,reforço,vestibular,concurso,treinamento" },
    { name: "Lazer e Entretenimento",          icon: "🎬", color: "#16A085", description: "cinema,teatro,show,festival,parque,museu,jogo,videogame,steam,playstation,xbox,nintendo,karaokê,balada,festa,viagem,passeio,hobby,camping,aquário" },
    { name: "Pet",                             icon: "🐾", color: "#8B4513", description: "ração,petisco,ração para cão,ração para gato,areia para gato,veterinário,vacina,vermífugo,antipulgas,banho e tosa,pet shop,plano de saúde pet,adestramento,hotel para pets,tapete higiênico" },
    { name: "Doações e Solidariedade",         icon: "❤️", color: "#C0392B", description: "dízimo,oferta,doação,ONG,caridade,esmola,vaquinha,creche,lar de idosos,contribuição,ajuda,cesta básica" },
    { name: "Presentes e Comemorações",        icon: "🎁", color: "#E91E63", description: "presente,aniversário,natal,dia das mães,dia dos pais,dia dos namorados,casamento,formatura,chá de bebê,réveillon,páscoa,carnaval,halloween,buquê" },
    { name: "Reformas e Decoração",            icon: "🔨", color: "#95A5A6", description: "tinta,parede,piso,reforma,tapete,cortina,persiana,luminária,espelho,quadro,planta,decoração,móvel,marceneiro,pedreiro,construção,material de construção" },
    { name: "Emergências e Imprevistos",       icon: "⚠️", color: "#E74C3C", description: "conserto urgente,reparo,chaveiro,vidraceiro,bombeiro,encanador,eletricista,guincho,pneu furado,remédio de emergência,multa por atraso,juro cartão,rotativo" },
    { name: "Seguro Pessoal / Residencial",    icon: "🛡️", color: "#E67E22", description: "seguro residencial,seguro de vida,seguro saúde,seguro viagem,apólice" },
    { name: "Impostos Pessoais",               icon: "📋", color: "#34495E", description: "IPTU,IPVA,IRPF,declaração IR,imposto de renda pessoa física,DARF pessoal" },
    { name: "Renda / Salário",                 icon: "💰", color: "#27AE60", description: "salário,holerite,contracheque,adiantamento,13°,férias recebidas,PLR,bônus,comissão" },
    { name: "Renda Extra / Freelance",         icon: "💵", color: "#2ECC71", description: "freelance,bico,renda extra,venda,mercado livre,ifood,serviço prestado,consultoria autônoma,pix recebido" },
    { name: "Outros (Pessoal)",                icon: "📌", color: "#95A5A6", description: "outros,diverso,não identificado" },
  ];

  for (let i = 0; i < personalCategories.length; i++) {
    const cat = personalCategories[i];
    await prisma.expenseCategory.upsert({
      where: { context_name: { context: "PESSOAL", name: cat.name } },
      update: { icon: cat.icon, color: cat.color, description: cat.description, isActive: true, displayOrder: i },
      create: { context: "PESSOAL", ...cat, isDefault: true, displayOrder: i },
    });
  }
  console.log(`✅ Categorias PESSOAL criadas/atualizadas (${personalCategories.length} categorias)`);

  // Categorias de despesas COMERCIAL (Office / Full)
  const commercialCategories = [
    { name: "Folha de Pagamento",             icon: "💰", color: "#6BCB77", description: "salário,funcionário,pró-labore,adiantamento,13°,férias pagas,PLR,rescisão,holerite,folha" },
    { name: "Encargos Trabalhistas",          icon: "📊", color: "#FF8C42", description: "INSS patronal,FGTS,PIS,COFINS,contribuição previdenciária,encargos,eSocial" },
    { name: "Aluguel Comercial",              icon: "🏢", color: "#FF6B6B", description: "aluguel do escritório,aluguel da loja,aluguel do galpão,aluguel comercial,ponto comercial" },
    { name: "Energia e Utilities",            icon: "💡", color: "#FFD93D", description: "luz comercial,energia elétrica da empresa,água da empresa,gás comercial,saneamento empresarial" },
    { name: "Internet e Telecom",             icon: "📱", color: "#4D96FF", description: "internet empresarial,PABX,plano corporativo,ramal,fibra empresarial,telefone corporativo,celular da empresa" },
    { name: "Fornecedores e Insumos",         icon: "🏭", color: "#9B59B6", description: "fornecedor,matéria-prima,insumo,embalagem,material de consumo,compra de produto,mercadoria,estoque" },
    { name: "Estoque e Mercadoria",           icon: "📦", color: "#3498DB", description: "estoque,mercadoria comprada,produto para revenda,reposição de estoque,compra para revenda" },
    { name: "Marketing e Publicidade",        icon: "📢", color: "#16A085", description: "google ads,meta ads,facebook ads,instagram ads,tráfego pago,marketing,publicidade,anúncio,panfleto,banner,logo,site,criação de conteúdo,redes sociais" },
    { name: "Impostos e Tributos",            icon: "📋", color: "#7F8C8D", description: "DAS,MEI,simples nacional,ISS,ICMS,IPI,PIS,COFINS,IRPJ,CSLL,DARF,guia de imposto,nota fiscal,tributo,imposto empresa" },
    { name: "Contabilidade e Jurídico",       icon: "👔", color: "#8E44AD", description: "contador,contabilidade,advogado,jurídico,escritório de contabilidade,consultoria tributária,honorários,assessoria" },
    { name: "Equipamentos e TI",              icon: "💻", color: "#2980B9", description: "computador,notebook,servidor,impressora,celular corporativo,software,licença,microsoft,adobe,erp,sistema,manutenção de equipamento" },
    { name: "Logística e Transporte",         icon: "🚚", color: "#E74C3C", description: "frete,entrega,transportadora,motoboy,courier,combustível empresa,gasolina empresa,pedágio empresa,IPVA empresa,manutenção frota" },
    { name: "Manutenção Predial",             icon: "🔧", color: "#E67E22", description: "manutenção do escritório,reforma,limpeza do local,ar-condicionado empresa,elétrico empresa,hidráulico empresa,limpeza predial" },
    { name: "Limpeza Comercial",              icon: "🧹", color: "#1ABC9C", description: "produto de limpeza empresa,terceirização de limpeza,diarista do escritório,serviço de higienização" },
    { name: "Despesas Bancárias",             icon: "🏦", color: "#34495E", description: "tarifa bancária,IOF,juros bancários,taxa de manutenção conta,cheque especial empresa,tarifas financeiras,TEDs,DOCs" },
    { name: "Treinamento e RH",               icon: "📈", color: "#27AE60", description: "curso para funcionário,treinamento,capacitação,recrutamento,seleção,anúncio de vaga,plano de carreira,benefícios" },
    { name: "Viagens Corporativas",           icon: "✈️", color: "#F39C12", description: "passagem aérea empresa,hotel empresa,diária,hospedagem,alimentação viagem,translado,uber corporativo,táxi empresa" },
    { name: "Seguros Empresariais",           icon: "🛡️", color: "#C0392B", description: "seguro empresarial,seguro do estabelecimento,seguro de frota,seguro de responsabilidade civil,apólice empresa" },
    { name: "Receita Operacional",            icon: "💵", color: "#27AE60", description: "venda,faturamento,receita,nota fiscal emitida,serviço prestado,comissão recebida,cliente pagou" },
    // ── Setoriais ────────────────────────────────────────────────────────────
    { name: "Clínica Médica (Insumos)",       icon: "🩺", color: "#E74C3C", description: "consulta médica,retorno,prontuário,receituário,jaleco,estetoscópio,esfigmomanômetro,termômetro clínica,otoscópio,oftalmoscópio,balança clínica,mesa de exames,lençol de papel clínica,algodão clínica,gaze,esparadrapo,álcool 70% clínica,luva de procedimento,máscara cirúrgica,avental descartável,lixeira hospitalar,sala de espera clínica,impressora de etiquetas clínica,toner clínica,papel A4 clínica" },
    { name: "Clínica Odontológica (Insumos)", icon: "🦷", color: "#3498DB", description: "consulta odontológica,profilaxia,flúor,radiografia periapical,radiografia panorâmica,restauração dental,canal endodontia,extração dental,implante dentário,prótese dental,clareamento,aparelho ortodôntico,manutenção aparelho,resina composta,cimento odontológico,anestésico local odontológico,seringa carpule,sugador descartável,broca odontológica,alginato,gesso odontológico,autoclave odontológica,luva estéril odontológica,óculos proteção odontológico,jaleco odontológico" },
    { name: "Hospital (Insumos e Operação)",  icon: "🏥", color: "#C0392B", description: "internação diária,UTI,centro cirúrgico,emergência hospitalar,pronto-socorro,triagem,hemograma,bioquímica,tomografia,ressonância,ultrassom,ecocardiograma,endoscopia,colonoscopia,biópsia,transfusão,quimioterapia,diálise,fisioterapia hospitalar,soro fisiológico,cateter venoso,sonda nasogástrica,sonda vesical,fralda geriátrica hospitalar,bomba de infusão,monitor multiparâmetro,respirador mecânico,desfibrilador,maca hospitalar,gases medicinais,autoclave central,lavanderia hospitalar,prontuário eletrônico hospitalar,gerador hospitalar" },
    { name: "Supermercado (Operação)",        icon: "🏪", color: "#27AE60", description: "empilhadeira supermercado,transpalete,palete supermercado,gôndola metálica,balança de loja,PDV supermercado,leitor código de barras,gaveta de dinheiro,impressora fiscal,papel de máquina,carrinho de compra,cesta plástica,lavadora de piso,enceradeira,câmara fria supermercado,sistema ERP supermercado,etiqueta EAS,sensor antifurto,gerador supermercado,rastreador de entrega,câmera CCTV supermercado,empacotador" },
    { name: "Padaria e Confeitaria (Operação)",icon: "🥐", color: "#FF8C42", description: "forno padaria,forno elétrico padaria,forno a gás padaria,amassadeira,cilindro de massa,modeladora de pão,câmara de fermentação,fatiadora industrial,batedeira planetária padaria,farinha de trigo,fermento biológico,farinha integral,manteiga padaria,ovos padaria,chocolate confeitaria,corante alimentício,pasta americana,chantilly,saco de confeitar,forma de bolo,assadeira,tabuleiro alumínio,expositor de pães,câmara fria padaria,balcão aquecido padaria,fritadeira padaria,alvará sanitário padaria,certificado manipulação ANVISA padaria" },
    { name: "Farmácia (Operação)",            icon: "💊", color: "#9B59B6", description: "medicamento genérico,medicamento similar,tarja vermelha,tarja preta,SNGPC,controle especial,balcão farmácia,controle de validade farmácia,datalogger farmácia,câmara vacinas,geladeira medicamentos,freezer vacinas,termômetro digital farmácia,cabine de fluxo laminar,autoclave farmácia,balança precisão farmácia,cápsula vazia,base para creme,seladora blister,licença ANVISA,alvará sanitário farmácia,ERP farmacêutico,descarpak,descarte medicamentos,lixeira hospitalar farmácia" },
    { name: "Restaurante (Operação)",         icon: "🍽️", color: "#E67E22", description: "chapa quente,fogão industrial restaurante,forno combinado restaurante,fritadeira industrial restaurante,exaustor industrial,coifa restaurante,lava-louças industrial,balcão buffet,talheres restaurante,pratos,copos restaurante,comanda eletrônica,PDV restaurante,delivery iFood,taxa iFood,taxa Rappi,motoboy restaurante,bag de entrega,marmita descartável,embalagem para delivery,câmara fria restaurante,blast chiller,óleo de fritura,caldo industrial" },
    { name: "Açougue (Operação)",             icon: "🥩", color: "#C0392B", description: "balcão refrigerado açougue,serra de fita,moedor de carne,seladora vácuo açougue,câmara de maturação,câmara resfriamento açougue,faca de açougue,faca de desossa,chaira afiar,luva de malha de aço,avental de raspas,gancho de aço,trilho aéreo,SIF inspeção federal,inspeção estadual SIE,bandeja isopor açougue,etiqueta validade carne,defumador industrial,cure nitrito,papel manteiga açougue,resíduo de sangue,coletor classe I,dedetização açougue,caixa gordura açougue" },
    { name: "Mercearia (Operação)",           icon: "🏬", color: "#16A085", description: "gôndola mercearia,expositor de balcão mercearia,freezer vertical,geladeira 2 portas,fatiador de frios,balança hortifrúti,registradora elétrica,PDV mercearia,etiquetadora de preço,sacola plástica mercearia,sacola de papel,cofre de parede,cesta mercearia,carrinho mini,câmera CCTV mercearia,software caixa mercearia,armadilha de roedor,armadilha barata,dedetização mercearia,bebedouro mercearia,café para cliente mercearia,controle de pragas mercearia" },
    { name: "Transporte por App (Operação)",  icon: "🚘", color: "#2980B9", description: "gasolina motorista app,óleo de motor,filtro de óleo,pneu motorista,alinhamento balanceamento,amortecedor,bateria automotiva,rastreador veicular,IPVA motorista,licenciamento motorista,taxa Uber,taxa 99,taxa inDriver,repasse de viagem,chip de dados motorista,suporte de celular carro,cadeirinha bebê,extintor automotivo,triângulo sinalização,álvara motorista,curso direção defensiva,MEI motorista,DASN motorista,nota fiscal motorista,despesa motorista aplicativo" },
    { name: "Outros (Comercial)",             icon: "📌", color: "#BDC3C7", description: "outros,diverso,não identificado empresarial" },
  ];

  for (let i = 0; i < commercialCategories.length; i++) {
    const cat = commercialCategories[i];
    await prisma.expenseCategory.upsert({
      where: { context_name: { context: "COMERCIAL", name: cat.name } },
      update: { icon: cat.icon, color: cat.color, description: cat.description, isActive: true, displayOrder: i },
      create: { context: "COMERCIAL", ...cat, isDefault: true, displayOrder: i },
    });
  }
  console.log(`✅ Categorias COMERCIAL criadas/atualizadas (${commercialCategories.length} categorias)`);

  // Configurações de Payment Gateways
  await prisma.paymentGatewayConfig.upsert({
    where: { provider: "infinitypay" },
    update: {
      isEnabled: true,
      environment: "sandbox",
    },
    create: {
      provider: "infinitypay",
      displayName: "InfinityPay",
      description: "Gateway de pagamentos InfinityPay - Cobranças recorrentes via PIX, Boleto e Cartão",
      isEnabled: false,
      isPrimary: true,
      environment: "sandbox",
      webhookUrl: "http://localhost:3001/api/webhooks/infinitypay",
      timeoutSeconds: 30,
      maxRetries: 3,
      infinityPayMerchantKey: "$mantecinfoxsystem",
      infinityPayApiKey: null,
      infinityPayWebhookSecret: null,
    },
  });
  console.log("✅ Configuração InfinityPay criada (preencher credenciais no dashboard)");

  await prisma.paymentGatewayConfig.upsert({
    where: { provider: "mercadopago" },
    update: {
      isEnabled: false,
    },
    create: {
      provider: "mercadopago",
      displayName: "Mercado Pago",
      description: "Gateway de pagamentos Mercado Pago - Cobranças via Cartão, PIX e Boleto",
      isEnabled: false,
      isPrimary: false,
      environment: "sandbox",
      webhookUrl: "http://localhost:3001/api/webhooks/mercadopago",
      timeoutSeconds: 30,
      maxRetries: 3,
      mercadoPagoAccessToken: null,
      mercadoPagoPublicKey: null,
      mercadoPagoWebhookSecret: null,
    },
  });
  console.log("✅ Configuração Mercado Pago criada (preencher credenciais no dashboard)");

  console.log("\n🎉 Seed concluído com sucesso!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 Credenciais do Dashboard Admin:");
  console.log("   URL:   http://localhost:3000");
  console.log("   Login: admin");
  console.log("   Senha: admin123");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
