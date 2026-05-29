import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBlockedAccessMessage } from "../subscriptionAccessService";

describe("subscriptionAccessService", () => {
  it("monta mensagem clara de bloqueio com valor e link", () => {
    const message = buildBlockedAccessMessage(
      "Plano FULL",
      9.9,
      new Date("2026-05-24T12:00:00"),
      "https://pay.example.com/abc",
    );

    assert.match(message, /Seu sistema está bloqueado até o pagamento do valor/i);
    assert.match(message, /R\$ 9,90/);
    assert.match(message, /https:\/\/pay\.example\.com\/abc/);
    assert.match(message, /Grato e ótima semana/i);
  });

  it("informa suporte quando link indisponível", () => {
    const message = buildBlockedAccessMessage("Plano HOME", 5, null, null);

    assert.match(message, /bloqueado/i);
    assert.match(message, /suporte/i);
    assert.doesNotMatch(message, /https?:\/\//);
  });
});
