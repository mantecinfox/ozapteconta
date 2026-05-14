import { logger } from "../utils/logger";
import { config } from "../config";

// ─── Normalizar número de telefone para +55XXXXXXXXXXX ────────────────────────
export function normalizePhoneToE164(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  
  // Se tem 11 ou 12 dígitos, é número brasileiro
  if (cleaned.length === 11 || cleaned.length === 12) {
    if (!cleaned.startsWith("55")) {
      cleaned = "55" + cleaned;
    }
  }
  
  // Se tem 13 dígitos e começa com 55, mantém
  if (cleaned.length === 13 && cleaned.startsWith("55")) {
    return "+" + cleaned;
  }
  
  // Se já tem +, remove e re-adiciona
  if (phone.startsWith("+")) {
    return phone;
  }
  
  return "+" + cleaned;
}

// ─── Validar se o número é válido (formato E.164 Brasil) ─────────────────────
export function isValidBrazilianPhone(phone: string): boolean {
  const normalized = normalizePhoneToE164(phone);
  // +55 + 2 dígitos área + 9 ou 8 dígitos número = 13 ou 12 caracteres
  return /^\+55\d{10,11}$/.test(normalized);
}

// ─── Testar conexão real com WhatsApp Business API ──────────────────────────────
export async function testWhatsappConnection(
  phoneNumberId: string,
  accessToken: string
): Promise<{ success: boolean; message: string; details?: any }> {
  if (!phoneNumberId || !accessToken) {
    return {
      success: false,
      message: "phoneNumberId e accessToken são obrigatórios",
    };
  }

  try {
    const url = `${config.whatsapp.apiBase}/${phoneNumberId}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        message: `Erro na API WhatsApp: ${response.status}`,
        details: error,
      };
    }

    const data = (await response.json()) as any;
    
    logger.info(`[WhatsApp Health] Status positivo para ${phoneNumberId}`);
    
    return {
      success: true,
      message: "WhatsApp Business conectado com sucesso",
      details: {
        displayPhoneNumber: data.display_phone_number,
        quality: data.quality_rating,
        verified: data.verified_name,
      },
    };
  } catch (err) {
    logger.error(`[WhatsApp Health] Erro ao testar conexão:`, err);
    return {
      success: false,
      message: `Erro ao conectar com WhatsApp API: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Enviar mensagem de teste para validar ────────────────────────────────────
export async function sendTestMessage(
  phoneNumberId: string,
  accessToken: string,
  testPhone: string
): Promise<{ success: boolean; message: string; details?: any }> {
  if (!phoneNumberId || !accessToken || !testPhone) {
    return {
      success: false,
      message: "phoneNumberId, accessToken e testPhone são obrigatórios",
    };
  }

  try {
    const recipientPhone = normalizePhoneToE164(testPhone).replace("+", "");
    
    const url = `${config.whatsapp.apiBase}/${phoneNumberId}/messages`;
    
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "template",
      template: {
        name: "hello_world", // Template padrão do WhatsApp
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        message: `Erro ao enviar mensagem de teste: ${response.status}`,
        details: error,
      };
    }

    const data = (await response.json()) as any;
    logger.info(`[WhatsApp Test] Mensagem enviada: ${data.messages?.[0]?.id}`);
    
    return {
      success: true,
      message: "Mensagem de teste enviada com sucesso",
      details: { messageId: data.messages?.[0]?.id },
    };
  } catch (err) {
    logger.error(`[WhatsApp Test] Erro ao enviar mensagem:`, err);
    return {
      success: false,
      message: `Erro ao enviar mensagem: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
