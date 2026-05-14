import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";

export interface OfficialWhatsappSettings {
  id: number;
  label: string;
  businessAccountId: string;
  phoneNumberId: string;
  phone: string;
  accessToken: string;
  permanentAccessToken?: string;
  webhookVerifyToken: string;
  webhookSecret?: string;
  isActive: boolean;
  maxClientsSupported: number;
  currentClientCount: number;
}

export interface GeneratedWhatsappSettings {
  id: number;
  label: string;
  phone: string;
  referenceCode: string;
  linkedToOfficialId?: number;
  connectionType: string;
  isActive: boolean;
  maxClients: number;
  currentClientCount: number;
  qrCodeData?: string;
}

class WhatsappSettingsService {
  private officialCached: Map<string, OfficialWhatsappSettings> = new Map();
  private generatedCached: Map<string, GeneratedWhatsappSettings> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  /**
   * Carrega configurações oficiais do WhatsApp
   */
  async loadOfficialAccounts(forceRefresh = false): Promise<Map<string, OfficialWhatsappSettings>> {
    if (!forceRefresh && this.officialCached.size > 0 && Date.now() < this.cacheExpiry) {
      return this.officialCached;
    }

    try {
      const accounts = await prisma.officialWhatsappAccount.findMany({
        where: { isActive: true },
      });

      this.officialCached.clear();

      for (const account of accounts) {
        this.officialCached.set(account.phone, {
          id: account.id,
          label: account.label,
          businessAccountId: account.businessAccountId,
          phoneNumberId: account.phoneNumberId,
          phone: account.phone,
          accessToken: account.accessToken,
          permanentAccessToken: account.permanentAccessToken || undefined,
          webhookVerifyToken: account.webhookVerifyToken,
          webhookSecret: account.webhookSecret || undefined,
          isActive: account.isActive,
          maxClientsSupported: account.maxClientsSupported,
          currentClientCount: account.currentClientCount,
        });
      }

      this.cacheExpiry = Date.now() + this.CACHE_TTL;
      logger.info(`[WhatsappSettings] ${this.officialCached.size} contas oficiais carregadas`);
      return this.officialCached;
    } catch (error) {
      logger.error("[WhatsappSettings] Erro ao carregar contas oficiais", error);
      return this.officialCached;
    }
  }

  /**
   * Carrega configurações geradas (QR Code)
   */
  async loadGeneratedAccounts(forceRefresh = false): Promise<Map<string, GeneratedWhatsappSettings>> {
    if (!forceRefresh && this.generatedCached.size > 0 && Date.now() < this.cacheExpiry) {
      return this.generatedCached;
    }

    try {
      const accounts = await prisma.generatedWhatsappAccount.findMany({
        where: { isActive: true },
      });

      this.generatedCached.clear();

      for (const account of accounts) {
        this.generatedCached.set(account.referenceCode, {
          id: account.id,
          label: account.label,
          phone: account.phone ?? "",
          referenceCode: account.referenceCode,
          linkedToOfficialId: account.linkedToOfficialId || undefined,
          connectionType: account.connectionType,
          isActive: account.isActive,
          maxClients: account.maxClients,
          currentClientCount: account.currentClientCount,
          qrCodeData: account.qrCodeData || undefined,
        });
      }

      this.cacheExpiry = Date.now() + this.CACHE_TTL;
      logger.info(`[WhatsappSettings] ${this.generatedCached.size} contas geradas carregadas`);
      return this.generatedCached;
    } catch (error) {
      logger.error("[WhatsappSettings] Erro ao carregar contas geradas", error);
      return this.generatedCached;
    }
  }

  /**
   * Obter conta oficial pelo phone
   */
  async getOfficialAccount(phone: string): Promise<OfficialWhatsappSettings | null> {
    const accounts = await this.loadOfficialAccounts();
    return accounts.get(phone) || null;
  }

  /**
   * Obter conta gerada pelo referenceCode
   */
  async getGeneratedAccount(referenceCode: string): Promise<GeneratedWhatsappSettings | null> {
    const accounts = await this.loadGeneratedAccounts();
    return accounts.get(referenceCode) || null;
  }

  /**
   * Encontrar melhor conta gerada com espaço disponível
   */
  async findAvailableGeneratedAccount(): Promise<GeneratedWhatsappSettings | null> {
    const accounts = await this.loadGeneratedAccounts();

    for (const account of accounts.values()) {
      if (account.currentClientCount < account.maxClients) {
        return account;
      }
    }

    logger.warn("[WhatsappSettings] Nenhuma conta gerada disponível com espaço");
    return null;
  }

  /**
   * Encontrar melhor conta oficial com espaço disponível
   */
  async findAvailableOfficialAccount(): Promise<OfficialWhatsappSettings | null> {
    const accounts = await this.loadOfficialAccounts();

    for (const account of accounts.values()) {
      if (account.currentClientCount < account.maxClientsSupported) {
        return account;
      }
    }

    logger.warn("[WhatsappSettings] Nenhuma conta oficial disponível com espaço");
    return null;
  }

  /**
   * Listar todas as contas (oficial + geradas)
   */
  async listAllAccounts() {
    const official = await this.loadOfficialAccounts();
    const generated = await this.loadGeneratedAccounts();

    return {
      official: Array.from(official.values()),
      generated: Array.from(generated.values()),
      total: official.size + generated.size,
    };
  }

  /**
   * Atualizar contador de clientes
   */
  async updateClientCount(type: "official" | "generated", id: number, increment: number) {
    try {
      if (type === "official") {
        await prisma.officialWhatsappAccount.update({
          where: { id },
          data: { currentClientCount: { increment } },
        });
      } else {
        await prisma.generatedWhatsappAccount.update({
          where: { id },
          data: { currentClientCount: { increment } },
        });
      }

      this.invalidateCache();
      logger.info(`[WhatsappSettings] Contador de clientes atualizado (${type}:${id}, ${increment > 0 ? "+":""}${increment})`);
    } catch (error) {
      logger.error("[WhatsappSettings] Erro ao atualizar contador de clientes", error);
    }
  }

  /**
   * Atualizar status de conexão
   */
  async updateConnectionStatus(
    type: "official" | "generated",
    id: number,
    status: string,
    error?: string
  ) {
    try {
      if (type === "official") {
        await prisma.officialWhatsappAccount.update({
          where: { id },
          data: {
            whatsappConnectionStatus: status,
            lastHealthCheck: new Date(),
            lastHealthCheckError: error || null,
          },
        });
      } else {
        await prisma.generatedWhatsappAccount.update({
          where: { id },
          data: {
            whatsappConnectionStatus: status,
            lastHealthCheck: new Date(),
            lastHealthCheckError: error || null,
          },
        });
      }

      this.invalidateCache();
      logger.info(`[WhatsappSettings] Status atualizado (${type}:${id}): ${status}`);
    } catch (error) {
      logger.error("[WhatsappSettings] Erro ao atualizar status", error);
    }
  }

  /**
   * Invalidar cache
   */
  invalidateCache(): void {
    this.officialCached.clear();
    this.generatedCached.clear();
    this.cacheExpiry = 0;
    logger.debug("[WhatsappSettings] Cache invalidado");
  }

  /**
   * Obter status de saúde
   */
  async getHealthStatus() {
    const official = await this.loadOfficialAccounts();
    const generated = await this.loadGeneratedAccounts();

    const status = {
      official: {
        total: official.size,
        active: Array.from(official.values()).filter((a) => a.isActive).length,
        accounts: Array.from(official.values()).map((a) => ({
          phone: a.phone,
          label: a.label,
          status: "monitoring", // Status real viria de health checks
          clientsUsed: a.currentClientCount,
          clientsAvailable: a.maxClientsSupported - a.currentClientCount,
        })),
      },
      generated: {
        total: generated.size,
        active: Array.from(generated.values()).filter((a) => a.isActive).length,
        accounts: Array.from(generated.values()).map((a) => ({
          phone: a.phone,
          label: a.label,
          referenceCode: a.referenceCode,
          status: "monitoring",
          clientsUsed: a.currentClientCount,
          clientsAvailable: a.maxClients - a.currentClientCount,
        })),
      },
    };

    return status;
  }
}

export const whatsappSettingsService = new WhatsappSettingsService();
