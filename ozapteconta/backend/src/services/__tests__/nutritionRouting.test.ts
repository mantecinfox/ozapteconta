import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  countNumberedFoodItems,
  extractFoodHints,
  looksLikeNutritionMealList,
} from "../nutritionRouting";

describe("nutritionRouting", () => {
  it("detecta lista composta de café da manhã", () => {
    const texto = "5 ovos, 2 bananas com aveia e mel e um cafe";
    assert.equal(looksLikeNutritionMealList(texto), true);
    assert.equal(countNumberedFoodItems(texto), 2);
    assert.ok(extractFoodHints(texto).length >= 4);
  });

  it("detecta lista só com frutas e complementos", () => {
    const texto = "2 bananas com aveia e mel e um cafe";
    assert.equal(looksLikeNutritionMealList(texto), true);
  });

  it("ignora mensagem financeira", () => {
    assert.equal(looksLikeNutritionMealList("paguei 5 reais de cafe"), false);
  });
});
