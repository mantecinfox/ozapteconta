/**
 * Garante locale UTF-8 no processo Node (PM2/Ubuntu sem pt_BR configurado).
 * Sem isso, acentos e emojis podem aparecer como "??" no WhatsApp.
 */
const UTF8_LOCALE_CANDIDATES = [
  "pt_BR.UTF-8",
  "C.UTF-8",
  "en_US.UTF-8",
] as const;

export function ensureAppUtf8Locale(): void {
  const atual = `${process.env.LC_ALL || ""} ${process.env.LANG || ""}`;
  if (/utf-?8/i.test(atual)) {
    return;
  }

  const escolhido = UTF8_LOCALE_CANDIDATES[0];
  process.env.LC_ALL = escolhido;
  process.env.LANG = escolhido;
  process.env.LC_CTYPE = escolhido;
}
