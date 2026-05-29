import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitWhatsAppText, WHATSAPP_IMAGE_CAPTION_SAFE_CHARS } from "../../utils/whatsappText";

describe("splitWhatsAppText", () => {
  it("mantém texto curto em um único bloco", () => {
    const texto = "Olá, tudo bem?";
    assert.deepEqual(splitWhatsAppText(texto), [texto]);
  });

  it("divide texto longo respeitando quebras de linha", () => {
    const paragrafo = "Linha de teste com conteúdo. ".repeat(120).trim();
    const blocos = splitWhatsAppText(paragrafo, 500);
    assert.ok(blocos.length > 1);
    assert.ok(blocos.every((b) => b.length <= 500));
    assert.ok(blocos.join(" ").includes("Linha de teste"));
  });
});

describe("whatsapp caption limits", () => {
  it("define margem segura abaixo de 1024 para legenda de imagem", () => {
    assert.ok(WHATSAPP_IMAGE_CAPTION_SAFE_CHARS > 0);
    assert.ok(WHATSAPP_IMAGE_CAPTION_SAFE_CHARS < 1024);
  });
});
