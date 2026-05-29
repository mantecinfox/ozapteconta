import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFullPhraseModelsMessage } from "../userPhraseModels";

describe("userPhraseModels", () => {
  it("inclui IPCA, CDI e FipeZap nos modelos completos", () => {
    const text = buildFullPhraseModelsMessage("Maria");
    assert.match(text, /ipca/i);
    assert.match(text, /cdi/i);
    assert.match(text, /fipezap/i);
    assert.match(text, /ipc fipe/i);
    assert.match(text, /Maria/);
    assert.match(text, /áudio/i);
  });
});
