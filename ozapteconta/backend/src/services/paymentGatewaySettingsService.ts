import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";

export interface PaymentGatewaySettings {
  provider: string;
  displayName: string;
  isEnabled: boolean;
  isPrimary: boolean;
  environment: string;
  webhookUrl?: string;
  timeoutSeconds: number;
  maxRetries: number;
  config: {
    infinitypay?: {
      merchantKey?: string;
      apiKey?: string;
      webhookSecret?: string;
    };
    mercadopago?: {
      accessToken?: string;
      publicKey?: string;
      webhookSecret?: string;
    };
  };
}

class PaymentGatewaySettingsService {
  private cachedConfigs: Map<string, PaymentGatewaySettings> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  /**
   * Carrega configurações do banco de dados com cache
   */
  async loadConfigs(forceRefresh = false): Promise<Map<string, PaymentGatewaySettings>> {
    if (!forceRefresh && this.cachedConfigs.size > 0) {
      const now = Date.now();
      let allValid = true;

      for (const [provider, _] of this.cachedConfigs.entries()) {
        const expiry = this.cacheExpiry.get(provider) || 0;
        if (now > expiry) {
          allValid = false;
          break;
        }
      }

      if (allValid) {
        return this.cachedConfigs;
      }
    }

    try {
      const dbConfigs = await prisma.paymentGatewayConfig.findMany();
      this.cachedConfigs.clear();

      for (const dbConfig of dbConfigs) {
        const settings: PaymentGatewaySettings = {
          provider: dbConfig.provider,
          displayName: dbConfig.displayName,
          isEnabled: dbConfig.isEnabled,
          isPrimary: dbConfig.isPrimary,
          environment: dbConfig.environment,
          webhookUrl: dbConfig.webhookUrl || undefined,
          timeoutSeconds: dbConfig.timeoutSeconds,
          maxRetries: dbConfig.maxRetries,
          config: {
            infinitypay: dbConfig.infinityPayApiKey ? {
              merchantKey: dbConfig.infinityPayMerchantKey || undefined,
              apiKey: dbConfig.infinityPayApiKey,
              webhookSecret: dbConfig.infinityPayWebhookSecret || undefined,
            } : undefined,
            mercadopago: dbConfig.mercadoPagoAccessToken ? {
              accessToken: dbConfig.mercadoPagoAccessToken,
              publicKey: dbConfig.mercadoPagoPublicKey || undefined,
              webhookSecret: dbConfig.mercadoPagoWebhookSecret || undefined,
            } : undefined,
          },
        };

        this.cachedConfigs.set(dbConfig.provider, settings);
        this.cacheExpiry.set(dbConfig.provider, Date.now() + this.CACHE_TTL);
      }

      logger.info(`[PaymentGatewaySettings] ${this.cachedConfigs.size} gateways carregados do banco`);
      return this.cachedConfigs;
    } catch (error) {
      logger.error("[PaymentGatewaySettings] Erro ao carregar configurações", error);
      return this.cachedConfigs;
    }
  }

  /**
   * Obter configurações de um gateway específico
   */
  async getConfig(provider: string): Promise<PaymentGatewaySettings | null> {
    const configs = await this.loadConfigs();
    return configs.get(provider) || null;
  }

  /**
   * Obter gateway primário
   */
  async getPrimaryGateway(): Promise<PaymentGatewaySettings | null> {
    const configs = await this.loadConfigs();

    for (const config of configs.values()) {
      if (config.isPrimary && config.isEnabled) {
        return config;
      }
    }

    // Se não houver primário, retornar o primeiro ativado
    for (const config of configs.values()) {
      if (config.isEnabled) {
        return config;
      }
    }

    return null;
  }

  /**
   * Listar todos os gateways ativos
   */
  async listActiveGateways(): Promise<PaymentGatewaySettings[]> {
    const configs = await this.loadConfigs();
    return Array.from(configs.values()).filter((c) => c.isEnabled);
  }

  /**
   * Validar se gateway tem credenciais configuradas
   */
  async isConfigured(provider: string): Promise<boolean> {
    const config = await this.getConfig(provider);
    if (!config || !config.isEnabled) return false;

    if (provider === "infinitypay") {
      return !!(config.config.infinitypay?.apiKey && config.config.infinitypay?.merchantKey);
    } else if (provider === "mercadopago") {
      return !!(config.config.mercadopago?.accessToken);
    }

    return false;
  }

  /**
   * Atualizar cache após salvar novo config
   */
  invalidateCache(provider?: string): void {
    if (provider) {
      this.cachedConfigs.delete(provider);
      this.cacheExpiry.delete(provider);
      logger.info(`[PaymentGatewaySettings] Cache invalidado para ${provider}`);
    } else {
      this.cachedConfigs.clear();
      this.cacheExpiry.clear();
      logger.info(`[PaymentGatewaySettings] Cache invalidado completamente`);
    }
  }

  /**
   * Obter informações de saúde dos gateways
   */
  async getHealthStatus(): Promise<Record<string, any>> {
    const configs = await this.loadConfigs();
    const status: Record<string, any> = {};

    for (const [provider, config] of configs.entries()) {
      status[provider] = {
        isEnabled: config.isEnabled,
        isPrimary: config.isPrimary,
        isConfigured: await this.isConfigured(provider),
        environment: config.environment,
        connectionStatus: "unknown", // Seria atualizado por health checks periódicos
      };
    }

    return status;
  }
}

export const paymentGatewaySettingsService = new PaymentGatewaySettingsService();
