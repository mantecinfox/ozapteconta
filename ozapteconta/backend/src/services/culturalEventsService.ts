import { logger } from "../utils/logger";
import { obterCoordenadasPorCepOuEndereco } from "./culturalGeocodeService";

class ErroBuscaCultural extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroBuscaCultural";
  }
}

/** Instâncias conhecidas — ordem importa (primária → fallback regional). */
const CADEIAS_INSTANCIA_POR_APELIDO: Record<string, string[]> = {
  sp: ["https://spcultura.prefeitura.sp.gov.br", "https://estadodacultura.sp.gov.br"],
  "sao paulo": ["https://spcultura.prefeitura.sp.gov.br", "https://estadodacultura.sp.gov.br"],
  pe: ["https://www.mapacultural.pe.gov.br"],
  pernambuco: ["https://www.mapacultural.pe.gov.br"],
  recife: ["https://www.mapacultural.pe.gov.br"],
  bh: [
    "https://mapaculturalbh.pbh.gov.br",
    "https://mapacultural.santaluzia.mg.gov.br",
    "https://mapacultural.ipatinga.mg.gov.br",
  ],
  "belo horizonte": [
    "https://mapaculturalbh.pbh.gov.br",
    "https://mapacultural.santaluzia.mg.gov.br",
    "https://mapacultural.ipatinga.mg.gov.br",
  ],
  mg: ["https://mapacultural.santaluzia.mg.gov.br", "https://mapacultural.ipatinga.mg.gov.br"],
  "minas gerais": ["https://mapacultural.santaluzia.mg.gov.br", "https://mapacultural.ipatinga.mg.gov.br"],
  ce: ["https://mapacultural.secult.ce.gov.br", "https://cultura.sobral.ce.gov.br"],
  ceara: ["https://mapacultural.secult.ce.gov.br"],
  fortaleza: ["https://mapacultural.secult.ce.gov.br"],
  mt: ["https://mapas.mt.gov.br"],
  ap: ["https://mapacultural.ap.gov.br"],
  rs: ["https://mapa.cultura.rs.gov.br"],
  nacional: ["https://mapas.cultura.gov.br"],
};

/** Último recurso quando a cidade não tem mapa local configurado. */
const CADEIA_FALLBACK_GLOBAL: string[] = [
  "https://mapacultural.secult.ce.gov.br",
  "https://mapas.mt.gov.br",
  "https://mapacultural.ap.gov.br",
];

const REQUEST_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; ozapteconta/1.0; agenda-cultural; +https://ozapteconta.com.br)",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

export type FiltroTempoCultural = "hoje" | "amanha" | "fim_de_semana" | null;

export interface ParametrosConsultaCultural {
  termoBusca: string;
  cidadeOuEstado: string | null;
  limiteResultados?: number;
  filtroTempo?: FiltroTempoCultural;
  buscaPorGeolocalizacao?: boolean;
  cepOuEnderecoCliente?: string;
}

export interface ConsultaCulturalDetectada {
  termoBusca: string;
  cidadeOuEstado: string | null;
  filtroTempo: FiltroTempoCultural;
  buscaPorGeolocalizacao: boolean;
}

type OcorrenciaCultural = {
  space?: { name?: string };
  rule?: { description?: string } | string;
};

type EventoCultural = {
  id?: number;
  name?: string;
  singleUrl?: string;
  occurrences?: OcorrenciaCultural[];
};

type ResultadoInstancia = {
  baseUrl: string;
  eventos: EventoCultural[];
};

const cacheResultadosCulturais = new Map<string, { timestamp: number; dados: string }>();
const TEMPO_CACHE_MS = 15 * 60 * 1000;
const LIMITE_PADRAO = 5;
const TIMEOUT_MS = 12_000;

function normalizarTexto(valor: string): string {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function pickTermoBusca(textoNormalizado: string): string {
  const matchShow = textoNormalizado.match(
    /\b(show|shows|teatro|teatros|cinema|festival|festivais|musical|musicais|musica|exposicao|exposicoes|museu|museus)\b/,
  );
  if (matchShow?.[1]) return matchShow[1];
  if (/\b(evento|eventos|agenda cultural|programacao cultural)\b/.test(textoNormalizado)) {
    return "evento";
  }
  return "evento";
}

function pickFiltroTempo(textoNormalizado: string): FiltroTempoCultural {
  if (/\b(hoje|agora|nesta noite|essa noite)\b/.test(textoNormalizado)) return "hoje";
  if (/\b(amanha|amanhã)\b/.test(textoNormalizado)) return "amanha";
  if (/\b(fim de semana|fds|sabado|sábado|domingo)\b/.test(textoNormalizado)) return "fim_de_semana";
  return null;
}

function pickCidadeOuEstado(textoOriginal: string): string | null {
  const texto = String(textoOriginal || "").trim();
  if (!texto) return null;

  const match = texto.match(/\bem\s+([A-Za-zÀ-ÿ\s]{2,60})(?:$|\?|\.|,)/i);
  if (!match?.[1]) return null;

  const local = match[1]
    .replace(/amanhã/gi, "")
    .replace(/\b(hoje|amanha|fim de semana|nesta noite|essa noite)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!local) return null;
  if (/\b(perto de mim|minha regiao|minha região|aqui)\b/i.test(local)) return null;
  return local;
}

export function detectCulturalEventsQuery(text: string): ConsultaCulturalDetectada | null {
  const original = String(text || "").trim();
  if (!original) return null;

  const normalized = normalizarTexto(original);
  const palavrasChave =
    /(evento|eventos|agenda cultural|programacao cultural|show|shows|teatro|teatros|cinema|festival|festivais|musical|musicais|musica|exposicao|exposicoes|museu|museus|perto de mim|na minha regiao|na minha região)/;
  if (!palavrasChave.test(normalized)) return null;

  const buscaPorGeolocalizacao = /\b(perto de mim|minha regiao|minha região|aqui por perto)\b/.test(normalized);

  return {
    termoBusca: pickTermoBusca(normalized),
    cidadeOuEstado: pickCidadeOuEstado(original),
    filtroTempo: pickFiltroTempo(normalized),
    buscaPorGeolocalizacao,
  };
}

function resolverCadeiaInstancias(localidadeRequisitada: string | null): string[] {
  const cadeia: string[] = [];
  const visto = new Set<string>();

  const incluir = (urls: string[]) => {
    for (const url of urls) {
      const base = url.replace(/\/$/, "");
      if (!visto.has(base)) {
        visto.add(base);
        cadeia.push(base);
      }
    }
  };

  if (localidadeRequisitada) {
    const normalizado = normalizarTexto(localidadeRequisitada);
    const apelidosOrdenados = Object.keys(CADEIAS_INSTANCIA_POR_APELIDO).sort(
      (left, right) => right.length - left.length,
    );
    for (const apelido of apelidosOrdenados) {
      if (normalizado.includes(apelido)) {
        incluir(CADEIAS_INSTANCIA_POR_APELIDO[apelido]);
      }
    }
  }

  if (!cadeia.length) {
    incluir(CADEIAS_INSTANCIA_POR_APELIDO.nacional);
  }

  incluir(CADEIA_FALLBACK_GLOBAL);
  return cadeia;
}

function construirFiltroTempoDescricao(filtroTempo: FiltroTempoCultural): string {
  if (filtroTempo === "hoje") return "Hoje";
  if (filtroTempo === "amanha") return "Amanhã";
  if (filtroTempo === "fim_de_semana") return "Fim de semana";
  return "Todos";
}

function extrairDescricaoOcorrencia(ocorrencia: OcorrenciaCultural | undefined): string {
  const regra = ocorrencia?.rule;
  if (regra && typeof regra === "object" && regra.description) {
    return String(regra.description);
  }
  if (typeof regra === "string" && regra.trim()) return regra.trim();
  return "Consulte datas no link";
}

function rotuloInstancia(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.replace(/^www\./, "");
  } catch {
    return baseUrl;
  }
}

function constroiNotificacaoSemResultado(parametros: ParametrosConsultaCultural, fonteUrl?: string): string {
  let textoRetorno = `🎭 Não encontrei eventos para "${parametros.termoBusca}"`;
  if (parametros.cidadeOuEstado) textoRetorno += ` em ${parametros.cidadeOuEstado}`;
  if (parametros.buscaPorGeolocalizacao) textoRetorno += " perto de você";

  const linkPortal = fonteUrl ? `${fonteUrl.replace(/\/$/, "")}/eventos/` : null;
  return (
    `${textoRetorno}.\n\n` +
    "Tente ampliar os termos (ex.: shows, teatro, festival) ou informar outra cidade." +
    (linkPortal ? `\n\n🔗 Agenda completa: ${linkPortal}` : "")
  );
}

function formatarVisualizacaoWhatsApp(
  listaDados: EventoCultural[],
  parametros: ParametrosConsultaCultural,
  fonteUrl?: string,
  usouFallback?: boolean,
): string {
  let cabecalho = "🎭 *Agenda Cultural Encontrada*\n";
  cabecalho += `Filtro: _${parametros.termoBusca || "evento"}_\n`;
  cabecalho += `Período: _${construirFiltroTempoDescricao(parametros.filtroTempo ?? null)}_\n`;
  if (parametros.cidadeOuEstado) cabecalho += `Região: _${parametros.cidadeOuEstado}_\n`;
  if (parametros.buscaPorGeolocalizacao) cabecalho += "Localização: _próximo de você_\n";
  if (fonteUrl) cabecalho += `Fonte: _${rotuloInstancia(fonteUrl)}_\n`;
  if (usouFallback) {
    cabecalho += "_ℹ️ Portal local indisponível; usei agenda de instância parceira._\n";
  }
  cabecalho += "\n";

  const itens = listaDados
    .map((evento, indice) => {
      const titulo = evento.name || "Evento sem título";
      const local = evento.occurrences?.[0]?.space?.name || "Local não informado";
      const data = evento.occurrences?.[0]
        ? extrairDescricaoOcorrencia(evento.occurrences[0])
        : "Consulte datas no link";
      const link =
        evento.singleUrl ||
        (evento.id && fonteUrl
          ? `${fonteUrl.replace(/\/$/, "")}/evento/${evento.id}/`
          : fonteUrl || "https://mapas.cultura.gov.br");

      return (
        `*${indice + 1}. ${titulo}*\n` +
        `📍 ${local}\n` +
        `📅 ${data}\n` +
        `🔗 ${link}`
      );
    })
    .join("\n\n");

  return cabecalho + itens + "\n\n_Dica: peça por data e cidade para refinar ainda mais._";
}

function separarCadeiaRegionalGlobal(cadeia: string[]): { regional: string[]; global: string[] } {
  const globalSet = new Set(CADEIA_FALLBACK_GLOBAL.map((url) => url.replace(/\/$/, "")));
  const regional: string[] = [];
  const global: string[] = [];

  for (const url of cadeia) {
    const base = url.replace(/\/$/, "");
    if (globalSet.has(base)) {
      global.push(base);
    } else {
      regional.push(base);
    }
  }

  return { regional, global };
}

async function tentarInstancias(
  instancias: string[],
  parametros: ParametrosConsultaCultural,
  coordenadas: { lat: number; lng: number } | null,
  instanciaPrimaria?: string,
): Promise<{ resposta: string } | null> {
  let ultimaInstanciaRespondida: string | null = null;

  /* MAX_ITER: instancias.length */
  for (let indice = 0; indice < instancias.length; indice += 1) {
    const baseUrl = instancias[indice];
    try {
      const resultado = await consultarInstancia(baseUrl, parametros, coordenadas);
      if (!resultado) continue;

      ultimaInstanciaRespondida = baseUrl;
      if (resultado.eventos.length === 0) {
        const termoBusca = String(parametros.termoBusca || "").trim();
        if (termoBusca && termoBusca !== "evento") {
          const consultaAmpla = await consultarInstancia(
            baseUrl,
            { ...parametros, termoBusca: "evento" },
            coordenadas,
          );
          if (consultaAmpla && consultaAmpla.eventos.length > 0) {
            logger.info(
              `[cultural-events] ampliação sem filtro nome fonte=${rotuloInstancia(baseUrl)} eventos=${consultaAmpla.eventos.length}`,
            );
            const usouFallback = Boolean(instanciaPrimaria && baseUrl !== instanciaPrimaria);
            return {
              resposta: formatarVisualizacaoWhatsApp(
                consultaAmpla.eventos,
                { ...parametros, termoBusca: "evento" },
                consultaAmpla.baseUrl,
                usouFallback,
              ),
            };
          }
        }
        continue;
      }

      const usouFallback = Boolean(instanciaPrimaria && baseUrl !== instanciaPrimaria);
      logger.info(
        `[cultural-events] OK fonte=${rotuloInstancia(baseUrl)} eventos=${resultado.eventos.length} fallback=${usouFallback}`,
      );

      return {
        resposta: formatarVisualizacaoWhatsApp(
          resultado.eventos,
          parametros,
          resultado.baseUrl,
          usouFallback,
        ),
      };
    } catch (err) {
      logger.warn(
        `[cultural-events] falha em ${rotuloInstancia(baseUrl)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (ultimaInstanciaRespondida) {
    return {
      resposta: constroiNotificacaoSemResultado(parametros, ultimaInstanciaRespondida),
    };
  }

  return null;
}

function buildCacheKey(parametros: ParametrosConsultaCultural): string {
  return [
    parametros.termoBusca,
    parametros.cidadeOuEstado,
    parametros.filtroTempo,
    String(Boolean(parametros.buscaPorGeolocalizacao)),
    parametros.cepOuEnderecoCliente,
    String(parametros.limiteResultados ?? LIMITE_PADRAO),
  ]
    .map((parte) => String(parte || "").trim())
    .join("|");
}

function montarUrlConsulta(
  baseUrl: string,
  parametros: ParametrosConsultaCultural,
  coordenadas: { lat: number; lng: number } | null,
): string {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/api/event/find`);
  const limite = Math.max(1, Math.min(10, Number(parametros.limiteResultados || LIMITE_PADRAO)));
  const termoBusca = String(parametros.termoBusca || "").trim();

  url.searchParams.set("@select", "id,name,singleUrl,occurrences.{space.{name},rule}");
  url.searchParams.set("@limit", String(limite));
  url.searchParams.set("@order", "name ASC");

  if (termoBusca && termoBusca !== "evento") {
    url.searchParams.set("name", `LIKE(*${termoBusca}*)`);
  }

  if (parametros.buscaPorGeolocalizacao && coordenadas) {
    url.searchParams.set(
      "_geoLocation",
      `GEONEAR(${coordenadas.lng},${coordenadas.lat},10000)`,
    );
  }

  return url.toString();
}

async function consultarInstancia(
  baseUrl: string,
  parametros: ParametrosConsultaCultural,
  coordenadas: { lat: number; lng: number } | null,
): Promise<ResultadoInstancia | null> {
  const urlConsulta = montarUrlConsulta(baseUrl, parametros, coordenadas);

  const respostaHttp = await fetch(urlConsulta, {
    method: "GET",
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!respostaHttp.ok) {
    logger.warn(`[cultural-events] ${rotuloInstancia(baseUrl)} HTTP ${respostaHttp.status}`);
    return null;
  }

  const corpo = await respostaHttp.text();
  if (!corpo.trim().startsWith("[")) {
    logger.warn(`[cultural-events] ${rotuloInstancia(baseUrl)} resposta não-JSON: ${corpo.slice(0, 80)}`);
    return null;
  }

  let loteEventos: unknown;
  try {
    loteEventos = JSON.parse(corpo);
  } catch (err) {
    logger.warn(`[cultural-events] ${rotuloInstancia(baseUrl)} JSON inválido: ${String(err)}`);
    return null;
  }

  if (!Array.isArray(loteEventos)) return null;
  return { baseUrl, eventos: loteEventos as EventoCultural[] };
}

async function resolverCoordenadas(parametros: ParametrosConsultaCultural): Promise<{ lat: number; lng: number } | null> {
  if (!parametros.buscaPorGeolocalizacao || !parametros.cepOuEnderecoCliente) return null;

  try {
    return await obterCoordenadasPorCepOuEndereco(parametros.cepOuEnderecoCliente);
  } catch (err) {
    logger.warn(`[cultural-events] geocode falhou: ${String(err)}`);
    return null;
  }
}

export async function buscarEventosCulturais(parametros: ParametrosConsultaCultural): Promise<string> {
  const termoBusca = String(parametros.termoBusca || "").trim();
  if (!termoBusca && !parametros.cidadeOuEstado && !parametros.buscaPorGeolocalizacao) {
    throw new ErroBuscaCultural("Parâmetros insuficientes para realizar a busca cultural.");
  }

  const chaveCache = buildCacheKey(parametros);
  const registroCache = cacheResultadosCulturais.get(chaveCache);
  if (registroCache && Date.now() - registroCache.timestamp < TEMPO_CACHE_MS) {
    return registroCache.dados;
  }

  const cadeiaInstancias = resolverCadeiaInstancias(parametros.cidadeOuEstado);
  const { regional, global } = separarCadeiaRegionalGlobal(cadeiaInstancias);
  const coordenadas = await resolverCoordenadas(parametros);
  const instanciaPrimaria = regional[0] || cadeiaInstancias[0];

  const resultadoRegional = await tentarInstancias(
    regional,
    parametros,
    coordenadas,
    instanciaPrimaria,
  );
  if (resultadoRegional) {
    cacheResultadosCulturais.set(chaveCache, { timestamp: Date.now(), dados: resultadoRegional.resposta });
    return resultadoRegional.resposta;
  }

  if (regional.length > 0) {
    return constroiNotificacaoSemResultado(parametros, instanciaPrimaria);
  }

  const resultadoGlobal = await tentarInstancias(global, parametros, coordenadas);
  if (resultadoGlobal) {
    cacheResultadosCulturais.set(chaveCache, { timestamp: Date.now(), dados: resultadoGlobal.resposta });
    return resultadoGlobal.resposta;
  }

  throw new ErroBuscaCultural("Nenhuma instância Mapas Culturais respondeu à consulta.");
}

/** Exposto para testes — valida cadeia de fallback por localidade. */
export function resolverCadeiaInstanciasParaTeste(localidade: string | null): string[] {
  return resolverCadeiaInstancias(localidade);
}

export { ErroBuscaCultural };
