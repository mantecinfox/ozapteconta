import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buscapeApiAdapter } from "../priceComparison/adapters/buscapeApiAdapter";

describe("buscapeApiAdapter", () => {
  it("retorna vazio sem tokens configurados", async () => {
    const offers = await buscapeApiAdapter.searchProducts("iphone 15", { limit: 5 });
    assert.deepEqual(offers, []);
  });
});
