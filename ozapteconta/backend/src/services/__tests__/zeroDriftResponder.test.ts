import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectEmotionalTone,
  resolveResponseSkin,
  buildZeroDriftSystemPrompt,
  isLikelyUnclearTranscript,
  buildUnclearAudioPrompt,
} from "../zeroDriftResponderService";

describe("zeroDriftResponderService", () => {
  it("detecta ansiedade no texto", () => {
    assert.equal(
      detectEmotionalTone("meu deus o dólar disparou o que faço"),
      "ansiedade",
    );
  });

  it("roteia mercado cripto para skin cripto", () => {
    const ctx = resolveResponseSkin("market", "como está o bitcoin hoje");
    assert.equal(ctx.skin, "cripto");
  });

  it("roteia FIPE + investimento com skin secundária", () => {
    const ctx = resolveResponseSkin("fipe", "quero comprar carro e aplicar em renda fixa");
    assert.equal(ctx.skin, "fipe");
    assert.equal(ctx.secondarySkin, "financeiro");
  });

  it("prompt não contém saudações proibidas na base", () => {
    const prompt = buildZeroDriftSystemPrompt(resolveResponseSkin("market", "selic hoje"));
    assert.match(prompt, /Nunca comece com "Olá"/);
    assert.match(prompt, /SKIN FINANCEIRO/);
  });

  it("identifica transcrição ininteligível", () => {
    assert.equal(isLikelyUnclearTranscript("ok"), true);
    assert.equal(isLikelyUnclearTranscript("dólar disparou renda fixa"), false);
  });

  it("monta prompt de áudio ruim", () => {
    const msg = buildUnclearAudioPrompt(["finanças", "nutrição"]);
    assert.match(msg, /Ruído no áudio/);
    assert.match(msg, /finanças/);
  });
});
