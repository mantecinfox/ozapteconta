import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPlausibleWhatsappPhone } from "../whatsappPhoneUtils";

describe("whatsappPhoneUtils", () => {
  it("aceita celular BR com DDI", () => {
    assert.equal(isPlausibleWhatsappPhone("553185297356"), true);
  });

  it("rejeita ID interno @lid (15 dígitos)", () => {
    assert.equal(isPlausibleWhatsappPhone("185950776856729"), false);
  });
});
