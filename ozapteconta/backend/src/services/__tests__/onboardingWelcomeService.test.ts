import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildOnboardingWelcomeMessage,
  buildTypeStepRetryMessage,
  detectOnboardingTone,
  isOnboardingGreeting,
  resolveWelcomeScenario,
  shouldRestartOnboardingFlow,
} from "../onboardingWelcomeService";

describe("onboardingWelcomeService", () => {
  it("detecta saudações comuns", () => {
    assert.equal(isOnboardingGreeting("ola"), true);
    assert.equal(isOnboardingGreeting("Olá!"), true);
    assert.equal(isOnboardingGreeting("oi tudo bem"), true);
    assert.equal(isOnboardingGreeting("bom dia"), true);
    assert.equal(isOnboardingGreeting("quero cadastrar"), false);
  });

  it("reinicia fluxo em saudação ou pedido de recomeço", () => {
    assert.equal(shouldRestartOnboardingFlow("ola"), true);
    assert.equal(shouldRestartOnboardingFlow("recomeçar"), true);
    assert.equal(shouldRestartOnboardingFlow("2"), false);
  });

  it("ajusta tom formal e informal", () => {
    assert.equal(detectOnboardingTone("Prezados, bom dia"), "formal");
    assert.equal(detectOnboardingTone("oi blz"), "informal");
  });

  it("monta boas-vindas para novo contato", () => {
    const message = buildOnboardingWelcomeMessage({
      clientMessage: "ola",
      scenario: "new",
    });
    assert.match(message, /ozapteconta/);
    assert.match(message, /Digite \*1\* ou \*2\*/);
    assert.doesNotMatch(message, /❌/);
  });

  it("monta boas-vindas para retorno com nome", () => {
    const message = buildOnboardingWelcomeMessage({
      clientMessage: "ola",
      displayName: "Cortinas Shop",
      scenario: "returning",
    });
    assert.match(message, /Cortinas Shop/);
    assert.match(message, /voltar|retornar/i);
  });

  it("retry do passo type é cordial", () => {
    const message = buildTypeStepRetryMessage({
      clientMessage: "hmm",
      displayName: "João",
    });
    assert.match(message, /Sem problemas/);
    assert.doesNotMatch(message, /❌/);
  });

  it("classifica retorno quando há step ativo e saudação", () => {
    const scenario = resolveWelcomeScenario({
      registrationStep: "type",
      registrationData: {},
      createdAt: new Date(),
      expiredReset: false,
      greetingRestart: true,
    });
    assert.equal(scenario, "returning");
  });
});
