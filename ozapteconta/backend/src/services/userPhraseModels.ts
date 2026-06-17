/**
 * Frases-modelo exibidas ao usuário (comando *modelos*, ajuda, fallbacks).
 * Texto ou áudio — mesmas expressões.
 */
import { buildFlightTravelExamplesBlock } from "./flightAssistantService";

export function buildMacroIndicatorsModelsBlock(compact = false): string {
  const indent = compact ? "   " : "";
  const br = compact ? "\n" : "\n\n";

  return (
    `📊 *Indicadores macro (inflação, juros):*${br}` +
    `${indent}• _ipca_ · _qual a inflação do mês?_${br}` +
    `${indent}• _ipca 12 meses_ · _inflação acumulada no ano_${br}` +
    `${indent}• _cdi_ · _cdi hoje_ · _taxa cdi_${br}` +
    `${indent}• _selic_ · _taxa selic_${br}` +
    `${indent}• _igp-m_ · _igpm_${br}` +
    `${indent}• _ipc fipe_ · _inflação são paulo_${br}` +
    `${indent}• _indicadores_ — menu completo${br}` +
    `_Plano Completo. Pode digitar ou falar no áudio._`
  );
}

export function buildCulturalEventsModelsBlock(compact = false): string {
  const indent = compact ? "   " : "";
  const br = compact ? "\n" : "\n\n";

  return (
    `🎭 *Agenda cultural, eventos e música local:*${br}` +
    `${indent}• _shows em São Paulo hoje_${br}` +
    `${indent}• _teatro perto de mim_${br}` +
    `${indent}• _agenda cultural no fim de semana em BH_${br}` +
    `${indent}• _festivais em Recife_${br}` +
    `${indent}• _eventos culturais amanhã em Curitiba_${br}` +
    `${indent}• _museu em São Paulo_${br}` +
    `${indent}• _exposições perto de mim_${br}` +
    `${indent}• _cinema hoje em Fortaleza_${br}` +
    `${indent}• _música ao vivo perto de mim_${br}` +
    `_Plano Completo ou Travel. Funciona por texto ou áudio._`
  );
}

export function buildFipeZapModelsBlock(compact = false): string {
  const indent = compact ? "   " : "";
  const br = compact ? "\n" : "\n\n";

  return (
    `🏠 *FipeZap (índice de imóveis):*${br}` +
    `${indent}• _fipezap_ — Brasil (venda)${br}` +
    `${indent}• _fipezap sao paulo venda_${br}` +
    `${indent}• _fipezap rio de janeiro aluguel_${br}` +
    `${indent}• _indice imovel brasil_${br}` +
    `${indent}• _indice imobiliario curitiba_${br}` +
    `${indent}• _fipezap_ — ajuda com cidades${br}` +
    `_Plano Completo. Índice agregado — não avalia um imóvel específico._`
  );
}

export function buildMarketModelsBlock(compact = false): string {
  const indent = compact ? "   " : "";
  const br = compact ? "\n" : "\n\n";

  return (
    `💹 *Mercado / cotações:*${br}` +
    `${indent}• _dólar hoje_ · _euro hoje_${br}` +
    `${indent}• _bitcoin_ · _ethereum_ · _bitcoin e xrp_${br}` +
    `${indent}• _PETR4_ · _VALE3_ · _ibovespa_${br}` +
    `${indent}• _mercado hoje_ — resumo geral${br}` +
    `_Plano Completo._`
  );
}

export function buildFipeVehicleModelsBlock(compact = false): string {
  const indent = compact ? "   " : "";
  const br = compact ? "\n" : "\n\n";

  return (
    `🚗 *Tabela FIPE (veículos):*${br}` +
    `${indent}• _fipe gol 2018_ · _fipe civic 2019_${br}` +
    `${indent}• _fipe moto cg 160 2022_${br}` +
    `${indent}• _fipe_ — mais exemplos${br}` +
    `_Plano Completo._`
  );
}

export function buildFullPhraseModelsMessage(senderName?: string): string {
  const nameSuffix = senderName ? `, ${senderName.split(" ")[0]}` : "";

  return (
    `📋 *Modelos de frases — ozapteconta*\n\n` +
    `Olá${nameSuffix}! Use estas frases como *modelo* (texto ou áudio). Quanto mais claro, melhor a resposta.\n` +
    `_A qualquer momento, envie:_ *modelo* · *modelos* · *MODELO*\n\n` +
    `💰 *Financeiro (registrar gasto/receita):*\n` +
    `• _compra de sanduíche natural e whey 20 reais_\n` +
    `• _paguei luz 150 dia 20_\n` +
    `• _recebi 500 de salário_\n` +
    `• _aluguel 1200 vence dia 5_\n\n` +
    `📋 *Consultas financeiras:*\n` +
    `• _ver contas_ · _contas pagas_ · _resumo_ · _paguei #14_\n\n` +
    `🥗 *Nutrição:*\n` +
    `• _comi pão com margarina, quantas calorias?_\n` +
    `• _whey engorda?_\n\n` +
    `${buildMarketModelsBlock()}\n\n` +
    `${buildMacroIndicatorsModelsBlock()}\n\n` +
    `${buildFipeVehicleModelsBlock()}\n\n` +
    `${buildFipeZapModelsBlock()}\n\n` +
    `${buildFlightTravelExamplesBlock()}\n\n` +
    `${buildCulturalEventsModelsBlock()}\n\n` +
    `📦 *Mudança de plano:*\n` +
    `• _quero mudar meu plano_\n` +
    `• _quero trocar de plano, quais opções tenho?_\n` +
    `• _quero mudar para completo_\n` +
    `• _quero alterar para básico_\n\n` +
    `🛒 *Comparador de preços:*\n` +
    `• _comparar preço smart tv samsung 50 polegadas_\n` +
    `• _menor preço iphone 13 128gb_\n` +
    `• _quanto custa air fryer mondial 4 litros_\n\n` +
    `🧮 *IMC / metabolismo:*\n` +
    `• _calcule meu IMC, mulher 65kg 1,62m 28 anos_\n\n` +
    `🎤 *Áudio:* fale naturalmente — ex.: _"ipca hoje"_, _"quero passagem barata pro nordeste"_, _"fipe gol 2020"_.\n\n` +
    `📧 *PDF por e-mail:*\n` +
    `• _enviar pdf do resumo para email seu@email.com_\n\n` +
    `❓ Atalhos: _ajuda_ · _mercado_ · _indicadores_ · _fipezap_ · _fipe_ · _voos_`
  );
}

export function buildHelpPhraseModelsPreview(): string {
  return (
    `📋 Digite *modelos* para ver *todas as frases de exemplo* (texto ou áudio).\n\n` +
    `Abaixo estão *modelos resumidos* — copie e adapte.\n\n` +
    `📝 *Registrar conta:* _luz 150 dia 20_ · _recebi 500_\n\n` +
    `📋 *Consultar:* _ver contas_ · _resumo_ · _paguei #123_\n\n` +
    `${buildMarketModelsBlock(true)}\n\n` +
    `${buildMacroIndicatorsModelsBlock(true)}\n\n` +
    `${buildFipeVehicleModelsBlock(true)}\n\n` +
    `${buildFipeZapModelsBlock(true)}\n\n` +
    `${buildFlightTravelExamplesBlock(true)}\n\n` +
    `${buildCulturalEventsModelsBlock(true)}\n\n` +
    `📦 *Plano:* _quero mudar meu plano_ · _quero mudar para completo_\n\n` +
    `🛒 *Preços:* _comparar preço notebook i5_\n\n` +
    `🎤 *Áudio:* mesmas frases — ex.: _"cdi hoje"_, _"quero passagem barata"_, _"fipe gol 2020"_.\n\n` +
    `_Dica: escreva como fala no dia a dia._`
  );
}

export function buildUnreadContentFallbackHints(): string {
  return (
    "Pode reenviar em texto? Funciono com:\n" +
    "• Digite *modelos* para ver todas as frases de exemplo\n" +
    "• Financeiro: \"paguei luz 150 dia 20\"\n" +
    "• Indicadores: \"ipca\", \"cdi\", \"selic\", \"ipca 12 meses\"\n" +
    "• FipeZap: \"fipezap sao paulo venda\"\n" +
    "• FIPE: \"fipe gol 2018\"\n" +
    "• Viagens: \"quero passagem barata pro nordeste\"\n" +
    "• Cotação: \"dólar hoje\", \"bitcoin\"\n" +
    "• Agenda cultural: \"shows em SP hoje\", \"teatro perto de mim\""
  );
}
