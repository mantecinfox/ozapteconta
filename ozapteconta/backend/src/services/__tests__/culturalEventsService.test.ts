import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectCulturalEventsQuery,
  inferirEscopoLocalidadeParaTeste,
  resolverCadeiaInstanciasParaTeste,
} from "../culturalEventsService";
import { buildCulturalEventsModelsBlock } from "../userPhraseModels";

// ─── Detecção de intenção cultural ────────────────────────────────────────────

describe("culturalEventsService — detecção de intenção", () => {
  // ── Keyword por tipo de evento ──

  it("detecta shows com cidade e filtro hoje", () => {
    const r = detectCulturalEventsQuery("quais shows em Recife hoje?");
    assert.ok(r);
    assert.equal(r.termoBusca, "shows");
    assert.equal(r.cidadeOuEstado, "Recife");
    assert.equal(r.filtroTempo, "hoje");
    assert.equal(r.buscaPorGeolocalizacao, false);
  });

  it("detecta teatro", () => {
    const r = detectCulturalEventsQuery("teatro em São Paulo amanhã");
    assert.ok(r);
    assert.equal(r.termoBusca, "teatro");
    assert.equal(r.filtroTempo, "amanha");
  });

  it("detecta cinema", () => {
    const r = detectCulturalEventsQuery("cinema em Fortaleza hoje");
    assert.ok(r);
    assert.equal(r.termoBusca, "cinema");
    assert.equal(r.filtroTempo, "hoje");
  });

  it("detecta festival", () => {
    const r = detectCulturalEventsQuery("festivais em Curitiba no fim de semana");
    assert.ok(r);
    assert.equal(r.termoBusca, "festivais");
    assert.equal(r.filtroTempo, "fim_de_semana");
  });

  it("detecta museu", () => {
    const r = detectCulturalEventsQuery("museu em Belo Horizonte");
    assert.ok(r);
    assert.equal(r.termoBusca, "museu");
  });

  it("detecta agenda cultural genérica", () => {
    const r = detectCulturalEventsQuery("programação cultural em BH");
    assert.ok(r);
    assert.equal(r.termoBusca, "evento");
  });

  it("detecta estado pedido com preposição no", () => {
    const r = detectCulturalEventsQuery("preciso de eventos hoje no Rio de Janeiro");
    assert.ok(r);
    assert.equal(r.termoBusca, "evento");
    assert.equal(r.cidadeOuEstado, "Rio de Janeiro");
    assert.equal(r.filtroTempo, "hoje");
  });

  it("detecta brasil inteiro quando solicitado", () => {
    const r = detectCulturalEventsQuery("quais eventos no Brasil hoje?");
    assert.ok(r);
    assert.equal(r.cidadeOuEstado, "Brasil");
    assert.equal(r.filtroTempo, "hoje");
  });

  // ── Geolocalização ──

  it("detecta busca por proximidade — teatro", () => {
    const r = detectCulturalEventsQuery("tem teatro perto de mim?");
    assert.ok(r);
    assert.equal(r.termoBusca, "teatro");
    assert.equal(r.buscaPorGeolocalizacao, true);
    assert.equal(r.cidadeOuEstado, null);
  });

  it("detecta busca por proximidade — exposição", () => {
    const r = detectCulturalEventsQuery("exposições perto de mim hoje");
    assert.ok(r);
    assert.equal(r.buscaPorGeolocalizacao, true);
    assert.equal(r.filtroTempo, "hoje");
  });

  // ── Filtros de tempo ──

  it("detecta filtro amanhã com acento", () => {
    const r = detectCulturalEventsQuery("shows amanhã em SP");
    assert.ok(r);
    assert.equal(r.filtroTempo, "amanha");
  });

  it("detecta fim de semana", () => {
    const r = detectCulturalEventsQuery("eventos no fim de semana em Recife");
    assert.ok(r);
    assert.equal(r.filtroTempo, "fim_de_semana");
  });

  it("sem filtro de tempo retorna null", () => {
    const r = detectCulturalEventsQuery("shows em SP");
    assert.ok(r);
    assert.equal(r.filtroTempo, null);
  });

  // ── Extração de cidade ──

  it("não contamina cidade com palavra de tempo", () => {
    const r = detectCulturalEventsQuery("shows em São Paulo amanhã");
    assert.ok(r);
    assert.ok(!r.cidadeOuEstado?.toLowerCase().includes("amanh"));
  });

  it("extrai cidade com dois termos", () => {
    const r = detectCulturalEventsQuery("teatro em Belo Horizonte");
    assert.ok(r);
    assert.match(r.cidadeOuEstado ?? "", /Belo Horizonte/);
  });

  // ── Áudio equivalência (mesma função, mesmo resultado) ──

  it("comportamento idêntico para texto transcrito de áudio", () => {
    const transcricaoAudio = "mostre os shows perto de mim hoje";
    const transcricaoTexto = "mostre os shows perto de mim hoje";
    const rAudio = detectCulturalEventsQuery(transcricaoAudio);
    const rTexto = detectCulturalEventsQuery(transcricaoTexto);
    assert.deepEqual(rAudio, rTexto);
  });

  // ── Rejeição de non-cultural ──

  it("ignora lançamento financeiro", () => {
    assert.equal(detectCulturalEventsQuery("paguei 89 reais de internet"), null);
  });

  it("ignora pergunta de nutrição", () => {
    assert.equal(detectCulturalEventsQuery("quantas calorias tem frango?"), null);
  });

  it("ignora consulta FIPE", () => {
    assert.equal(detectCulturalEventsQuery("fipe gol 2018"), null);
  });

  it("ignora texto vazio", () => {
    assert.equal(detectCulturalEventsQuery(""), null);
    assert.equal(detectCulturalEventsQuery("   "), null);
  });
});

describe("culturalEventsService — fallback de instâncias", () => {
  it("mantém BH específico sem cair em Santa Luzia", () => {
    const cadeia = resolverCadeiaInstanciasParaTeste("Belo Horizonte, MG");
    assert.ok(cadeia[0].includes("mapaculturalbh.pbh.gov.br"));
    assert.ok(!cadeia.some((url) => url.includes("santaluzia.mg.gov.br")));
  });

  it("inclui cadeia global quando localidade é desconhecida", () => {
    const cadeia = resolverCadeiaInstanciasParaTeste(null);
    assert.ok(cadeia.length >= 2);
  });

  it("usa instância nacional para Rio de Janeiro", () => {
    const cadeia = resolverCadeiaInstanciasParaTeste("Rio de Janeiro");
    assert.ok(cadeia[0].includes("mapas.cultura.gov.br"));
  });
});

describe("culturalEventsService — escopo da localidade", () => {
  it("classifica Belo Horizonte como cidade", () => {
    assert.equal(inferirEscopoLocalidadeParaTeste("Belo Horizonte, MG"), "cidade");
  });

  it("classifica Rio de Janeiro como estado", () => {
    assert.equal(inferirEscopoLocalidadeParaTeste("Rio de Janeiro"), "estado");
  });

  it("classifica Brasil como pais", () => {
    assert.equal(inferirEscopoLocalidadeParaTeste("Brasil"), "pais");
  });
});

// ─── Bloco de modelos de frases ───────────────────────────────────────────────

describe("userPhraseModels — bloco cultural", () => {
  it("bloco completo contém exemplos de shows, teatro, música e localização", () => {
    const bloco = buildCulturalEventsModelsBlock();
    assert.match(bloco, /shows/i);
    assert.match(bloco, /teatro/i);
    assert.match(bloco, /festivais?/i);
    assert.match(bloco, /perto de mim/i);
    assert.match(bloco, /Plano Completo/i);
    assert.match(bloco, /\u00e1udio/i);
  });

  it("bloco compacto não possui quebras duplas de linha", () => {
    const compacto = buildCulturalEventsModelsBlock(true);
    assert.ok(!compacto.includes("\n\n"), "modo compacto não deve ter \\n\\n");
  });
});
