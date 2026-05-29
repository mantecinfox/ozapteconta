/**
 * Detecção de mensagens de refeição/alimentos em linguagem natural (WhatsApp).
 */

export const NUTRITION_FOOD_TERMS =
  /arroz|feijao|frango|ovo|ovos|banana|bananas|maca|macas|pao|queijo|leite|carne|peixe|batata|mandioca|salada|alface|tomate|abacate|aveia|mel|iogurte|yogurte|whey|suplemento|pizza|hamburguer|sushi|refrigerante|bolo|chocolate|biscoito|macarrao|acai|suco|cafe|marmita|lanche|granola|tapioca|inhame|quinoa|brocolis|atum|salmao|tilapia|peito.*frango|clara.*ovo/;

const MEAL_BLOCK =
  /\b(cafe da manha|almoco|jantar|ceia|lanche|refeicao|marmita|caf[eé])\b/;

const QUANTITY_FOOD =
  /\b\d+\s*(ovos?|bananas?|macas?|fatias?|copos?|colheres?|gramas?|g\b|unidades?|xicaras?)\b/;

const INDEFINITE_FOOD =
  /\b(um|uma|uns|umas)\s+(cafe|pao|banana|ovo|copo|xicara|fatia|colher)\b/;

export function normalizeMealText(text: string): string {
  if (typeof text !== "string") return "";
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Conta itens com quantidade explícita: "5 ovos", "2 bananas". */
export function countNumberedFoodItems(text: string): number {
  const normalized = normalizeMealText(text);
  const matches = normalized.match(/\b\d+\s+[a-z]{3,}/g);
  return matches?.length ?? 0;
}

/** Lista de alimentos em linguagem coloquial, com ou sem a palavra "caloria". */
export function looksLikeNutritionMealList(text: string): boolean {
  const normalized = normalizeMealText(text);
  if (!normalized || normalized.length < 4) return false;

  if (
    /\b(paguei|comprei|compras|gastei|recebi|reais|real|r\$|vence|vencimento|boleto|fatura|salario|aluguel)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  if (!NUTRITION_FOOD_TERMS.test(normalized)) return false;

  const numbered = countNumberedFoodItems(text);
  if (numbered >= 2) return true;
  if (numbered >= 1 && /[,;]|\be\b|\bcom\b|\bmais\b/.test(normalized)) return true;
  if (QUANTITY_FOOD.test(normalized)) return true;
  if (INDEFINITE_FOOD.test(normalized) && NUTRITION_FOOD_TERMS.test(normalized)) return true;
  if (MEAL_BLOCK.test(normalized)) return true;

  const foodHits = (normalized.match(new RegExp(NUTRITION_FOOD_TERMS.source, "g")) ?? []).length;
  if (foodHits >= 2 && /[,;]|\be\b/.test(normalized)) return true;

  return false;
}

/** Tokens de alimento mencionados (para validar resposta da IA). */
export function extractFoodHints(text: string): string[] {
  const normalized = normalizeMealText(text);
  const hints = [
    "ovo", "ovos", "banana", "bananas", "aveia", "mel", "cafe", "pao", "arroz", "feijao",
    "frango", "carne", "leite", "queijo", "iogurte", "whey", "maca", "abacate", "granola",
  ];
  return hints.filter((hint) => {
    const stem = hint.replace(/s$/, "");
    return normalized.includes(hint) || normalized.includes(stem);
  });
}

export function isComplexMealList(text: string): boolean {
  return countNumberedFoodItems(text) >= 2 || extractFoodHints(text).length >= 3;
}
