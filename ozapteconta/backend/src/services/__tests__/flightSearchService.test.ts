import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectFlightQuery, parseTravelDateFromText } from "../flightSearchService";
import { hasFlightSearch, hasFullFeatures } from "../planAccessService";
import { isTravelRelatedQuery } from "../flightAssistantService";

describe("flightSearchService", () => {
  it("detecta rota com cidades brasileiras", () => {
    const query = detectFlightQuery("voo de sao paulo para rio dia 15/06");
    assert.ok(query);
    assert.equal(query?.originCode, "SAO");
    assert.equal(query?.destinationCode, "RIO");
    assert.equal(query?.outboundDate, "2026-06-15");
  });

  it("detecta códigos IATA diretos", () => {
    const query = detectFlightQuery("passagem GRU para BSB");
    assert.ok(query);
    assert.equal(query?.originCode, "GRU");
    assert.equal(query?.destinationCode, "BSB");
  });

  it("interpreta datas relativas", () => {
    const parsed = parseTravelDateFromText("quero viajar mes que vem");
    assert.ok(parsed);
    assert.match(parsed || "", /^\d{4}-\d{2}-\d{2}$/);
  });

  it("ignora mensagens sem intenção de voo", () => {
    assert.equal(detectFlightQuery("paguei conta 123"), null);
  });
});

describe("flightAssistantService", () => {
  it("detecta intenção vaga de viagem", () => {
    assert.equal(isTravelRelatedQuery("quero passagem barata"), true);
    assert.equal(isTravelRelatedQuery("preciso viajar pro nordeste"), true);
    assert.equal(isTravelRelatedQuery("paguei o aluguel"), false);
  });
});

describe("planAccessService", () => {
  it("libera recursos completos para FULL e TRAVEL", () => {
    assert.equal(hasFullFeatures("FULL"), true);
    assert.equal(hasFullFeatures("TRAVEL"), true);
    assert.equal(hasFullFeatures("HOME"), false);
  });

  it("restringe voos ao plano TRAVEL", () => {
    assert.equal(hasFlightSearch("TRAVEL"), true);
    assert.equal(hasFlightSearch("FULL"), false);
    assert.equal(hasFlightSearch("HOME"), false);
  });
});
