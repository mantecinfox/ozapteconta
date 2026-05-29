import { normalizeForIntent } from "./aiLearningService";

export type ReportCommandType = "report_email" | "report_now";

/** Pedido de enviar PDF/relatório por e-mail (texto ou áudio). */
export function isReportEmailRequest(text: string): boolean {
  const t = String(text || "").toLowerCase();
  const hasReport = /(pdf|relat[oó]rio|resumo)/.test(t);
  const hasAction = /(enviar|envia|envie|manda|mandar|gerar|gera|mande)/.test(t);
  const hasEmailHint = /(email|e-mail|e mail|gmail|hotmail|outlook|arroba|@)/.test(t);
  return hasReport && (hasAction || hasEmailHint);
}

export function isReportNowRequest(text: string): boolean {
  const t = String(text || "").toLowerCase().trim();
  return (
    /^(gerar|gera|enviar|envia)\s+(pdf|relat[oó]rio)(\s+agora)?$/.test(t) ||
    /^(pdf|relat[oó]rio)\s+agora$/.test(t)
  );
}

export function detectReportCommand(text: string): ReportCommandType | null {
  if (isReportEmailRequest(text)) return "report_email";
  if (isReportNowRequest(text)) return "report_now";
  return null;
}

export interface ResolvedEmail {
  email: string | null;
  suggestedEmail?: string;
}

/**
 * Extrai e-mail de transcrições imperfeitas (STT).
 * Ex.: "mantecinfox gmail com" → mantecinfox@gmail.com
 */
export function resolveEmailFromUtterance(text: string): ResolvedEmail {
  const direct = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (direct?.[0]) {
    return { email: direct[0].toLowerCase() };
  }

  const n = normalizeForIntent(text);

  const gmailSpoken = n.match(/\b([a-z0-9][a-z0-9._+-]{2,})\s*(gmail|googlemail)(?:\s+com)?\b/);
  if (gmailSpoken?.[1]) {
    return { email: `${gmailSpoken[1]}@gmail.com` };
  }

  const atDomain = n.match(/\b([a-z0-9][a-z0-9._+-]{2,})\s*(arroba|at)\s*([a-z0-9.-]{2,})\b/);
  if (atDomain?.[1] && atDomain[3]) {
    const domain = atDomain[3].includes(".") ? atDomain[3] : `${atDomain[3]}.com`;
    return { email: `${atDomain[1]}@${domain}` };
  }

  if (/\bgmail\b/.test(n) || /\bgooglemail\b/.test(n)) {
    const local = n.match(/\b([a-z0-9][a-z0-9._+-]{2,})\b/);
    if (local?.[1] && local[1] !== "gmail" && local[1] !== "googlemail") {
      return { email: `${local[1]}@gmail.com` };
    }
  }

  const brokenDomain = String(text || "").match(/\b([a-z0-9][a-z0-9._+-]{2,})\.(com|com\.br|net|org)\b/i);
  if (brokenDomain?.[1] && (/\bgmail\b/i.test(text) || /\bgoogle\s*mail\b/i.test(text))) {
    const localPart = brokenDomain[1].toLowerCase();
    return { email: `${localPart}@gmail.com` };
  }

  if (brokenDomain?.[1] && isReportEmailRequest(text)) {
    const localPart = brokenDomain[1].toLowerCase();
    return {
      email: null,
      suggestedEmail: `${localPart}@gmail.com`,
    };
  }

  return { email: null };
}
