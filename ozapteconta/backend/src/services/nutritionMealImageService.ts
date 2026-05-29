/**
 * Imagem fixa de refeição saudável (frango, arroz, feijão, brócolis)
 * enviada junto com respostas de análise de calorias/macros.
 */
import fs from "fs";
import path from "path";
import { logger } from "../utils/logger";

const MEAL_IMAGE_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "assets",
  "nutrition-meal",
  "refeicao-saudavel.png",
);

let pngCache: Buffer | null = null;

export function getNutritionMealPng(): Buffer | null {
  if (pngCache) return pngCache;
  /* SANITY CHECK: asset existe no disco */
  if (!fs.existsSync(MEAL_IMAGE_PATH)) {
    logger.warn(`[nutrition-meal] PNG ausente: ${MEAL_IMAGE_PATH}`);
    return null;
  }
  pngCache = fs.readFileSync(MEAL_IMAGE_PATH);
  return pngCache;
}

export function warmupNutritionMealCache(): void {
  const png = getNutritionMealPng();
  if (png) {
    logger.info(`[nutrition-meal] cache aquecido: ${png.length} bytes`);
  }
}
