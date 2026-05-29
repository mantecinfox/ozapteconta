/**
 * Tolerância fonética e ortográfica para detecção de intent em pt-BR.
 *
 * Usuários cometem erros recorrentes (V↔W, K↔C, Y↔I, PH↔F, LH↔L, NH↔N,
 * SS↔S, consoantes duplicadas, etc.). Esta camada converte o texto já
 * normalizado por `normalizeForIntent` (NFD + lowercase + sem acentos) em uma
 * forma canônica que reduz essas confusões a um único caractere.
 *
 * REGRAS APLICADAS (na ordem):
 *  - dígrafo `ph` → `f`            (philosophia → filosofia)
 *  - dígrafo `qu` antes de e/i → `c` (quero → cero, quilo → cilo)
 *  - dígrafo `gu` antes de e/i → `g` (guerra → gerra)
 *  - letra `w` → `v`               (wolkvagen → volkvagen, sandwich → sandvich)
 *  - letra `k` → `c`               (kasa → casa, kcal → ccal)
 *  - letra `y` → `i`               (yogurte → iogurte, whey → vhei)
 *  - dígrafo `lh` → `l`            (filho → filo)
 *  - dígrafo `nh` → `n`            (galinha → galina)
 *  - dígrafo `ss` → `s`            (engessar → engesar)
 *  - consoantes duplicadas → simples (`rr|tt|ll|pp|cc|ff|mm|nn|bb|dd|gg`)
 *  - vogais duplicadas internas → simples (apenas em fim de palavra: "aluguell" → "aluguel")
 *
 * NÃO toca em c/ç/s/x/ch porque a maioria dos regex existentes já cobre
 * variações como `pre[cç]o` explicitamente; substituições agressivas aqui
 * gerariam falsos positivos.
 */

/**
 * Aplica substituições fonéticas. Recebe uma string já normalizada
 * (NFD + lowercase + sem acentos). Retorna a forma canônica.
 */
export function phoneticNormalize(input: string): string {
  if (!input) return "";
  let s = input;

  s = s.replace(/ph/g, "f");
  s = s.replace(/qu(?=[ei])/g, "c");
  s = s.replace(/gu(?=[ei])/g, "g");
  s = s.replace(/w/g, "v");
  s = s.replace(/k/g, "c");
  s = s.replace(/y/g, "i");
  s = s.replace(/lh/g, "l");
  s = s.replace(/nh/g, "n");
  s = s.replace(/ss/g, "s");
  /* Consoantes duplicadas → simples (incluindo `s`: samsuung → samsung, contass → contas) */
  s = s.replace(/([bcdfgjlmnprstvxz])\1+/g, "$1");
  /* Vogais duplicadas internas → simples (samsuung → samsung, alooo → alo) */
  s = s.replace(/([aeiou])\1+/g, "$1");

  return s.replace(/\s+/g, " ").trim();
}

/** Distância de Levenshtein clássica. O(m*n) em tempo, O(min(m,n)) em memória. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const m = a.length;
  const n = b.length;
  /* MAX_ITER: m*n — limitado pelo tamanho dos inputs (palavras curtas) */
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Verifica se algum token de `haystack` corresponde fuzzy ao `needle`.
 * Usa `phoneticNormalize` em ambos antes de comparar.
 *
 * @param haystack texto a buscar (já normalizado)
 * @param needle palavra-alvo (já normalizada)
 * @param maxDistance tolerância de edits (1-3 é seguro para PT-BR)
 */
export function fuzzyContainsWord(
  haystack: string,
  needle: string,
  maxDistance = 1,
): boolean {
  if (!haystack || !needle) return false;
  const target = phoneticNormalize(needle);
  if (target.length < 3) {
    return haystack.split(/\s+/).some((t) => phoneticNormalize(t) === target);
  }

  const tokens = haystack.split(/\s+/).filter((t) => t.length >= 3);
  for (const token of tokens) {
    const norm = phoneticNormalize(token);
    if (norm === target) return true;
    if (Math.abs(norm.length - target.length) > maxDistance) continue;
    if (levenshtein(norm, target) <= maxDistance) return true;
  }
  return false;
}

/** Versão de vários needles: passa se ALGUM bater. */
export function fuzzyContainsAny(
  haystack: string,
  needles: string[],
  maxDistance = 1,
): string | null {
  for (const needle of needles) {
    if (fuzzyContainsWord(haystack, needle, maxDistance)) return needle;
  }
  return null;
}

/**
 * Aplica regex contra a forma original (já normalizada) E a forma fonética.
 * Útil para mantermos os regex existentes intactos e ainda assim aceitar
 * erros comuns de digitação.
 */
export function regexMatchesTolerant(regex: RegExp, normalized: string): boolean {
  if (regex.test(normalized)) return true;
  const phonetic = phoneticNormalize(normalized);
  if (phonetic === normalized) return false;
  return regex.test(phonetic);
}
