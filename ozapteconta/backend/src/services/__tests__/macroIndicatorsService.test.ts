import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectFipeZapQuery } from "../fipeZapService";
import { detectMarketQuery } from "../marketDataService";

describe("fipeZapService.detectFipeZapQuery", () => {
  it("detecta consulta nacional", () => {
    const query = detectFipeZapQuery("fipezap brasil venda");
    assert.ok(query);
    assert.equal(query?.scope, "brasil");
    assert.equal(query?.segment, "venda");
  });

  it("detecta cidade e locação", () => {
    const query = detectFipeZapQuery("indice imovel sao paulo aluguel");
    assert.ok(query);
    assert.equal(query?.citySlug, "sao-paulo");
    assert.equal(query?.segment, "locacao");
  });

  it("ignora consulta FIPE veículo", () => {
    assert.equal(detectFipeZapQuery("fipe gol 2020"), null);
  });
});

describe("marketDataService.detectMarketQuery macro", () => {
  it("detecta CDI", () => {
    const query = detectMarketQuery("cdi hoje");
    assert.equal(query?.type, "cdi");
  });

  it("detecta IPCA 12 meses antes do mensal", () => {
    const query = detectMarketQuery("ipca 12 meses");
    assert.equal(query?.type, "ipca12");
  });

  it("detecta IPC-Fipe", () => {
    const query = detectMarketQuery("ipc fipe");
    assert.equal(query?.type, "ipcfipe");
  });
});
