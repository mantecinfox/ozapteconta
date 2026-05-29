/** Telefone WhatsApp plausível (BR). Rejeita IDs internos @lid (14–15 dígitos sem DDI 55). */
export function isPlausibleWhatsappPhone(digitsRaw: string): boolean {
  const digits = String(digitsRaw || "").replace(/\D/g, "");
  if (!digits) return false;

  if (digits.startsWith("55")) {
    return digits.length === 12 || digits.length === 13;
  }

  if (digits.length >= 14) {
    return false;
  }

  return digits.length >= 10 && digits.length <= 11;
}

export function stripWhatsappJid(value: string): string {
  return String(value || "").replace(/@.*/, "").replace(/\D/g, "");
}
