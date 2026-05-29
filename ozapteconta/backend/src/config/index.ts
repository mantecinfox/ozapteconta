import dotenv from "dotenv";
import path from "path";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",

  jwt: {
    secret: process.env.JWT_SECRET || "change_this_secret_in_production",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },

  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "meu_verify_token_secreto",
    webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET || "",
    apiVersion: "v19.0",
    get apiBase() {
      return `https://graph.facebook.com/${this.apiVersion}`;
    },
  },

  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    groqApiKey: process.env.GROQ_API_KEY || "",
    grokApiKey: process.env.GROK_API_KEY || "",
    abacusApiKey: process.env.ABACUS_API_KEY || "",
    abacusApiUrl: process.env.ABACUS_API_URL || "https://routellm.abacus.ai",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  },

  storage: {
    audioPath: process.env.AUDIO_STORAGE_PATH
      ? path.resolve(process.env.AUDIO_STORAGE_PATH)
      : path.resolve(__dirname, "../../storage/audios"),
    reportsPath: process.env.REPORTS_STORAGE_PATH
      ? path.resolve(process.env.REPORTS_STORAGE_PATH)
      : path.resolve(__dirname, "../../storage/reports"),
  },

  email: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || "",
  },

  log: {
    level: process.env.LOG_LEVEL || "info",
    file: process.env.LOG_FILE || path.resolve(__dirname, "../../logs/app.log"),
  },

  market: {
    brapiToken: process.env.BRAPI_TOKEN || "",
    alphaVantageKey: process.env.ALPHA_VANTAGE_KEY || "",
  },

  externalData: {
    ipeadataBaseUrl: process.env.IPEADATA_BASE_URL || "http://www.ipeadata.gov.br/api/odata4",
    buscapeAppToken: process.env.BUSCAPE_APP_TOKEN || "",
    buscapeAuthToken: process.env.BUSCAPE_AUTH_TOKEN || "",
    fipeZapDiskCacheDir: process.env.FIPEZAP_CACHE_DIR
      ? path.resolve(process.env.FIPEZAP_CACHE_DIR)
      : path.resolve(__dirname, "../../data/fipezap-cache"),
    get buscapeApiConfigured(): boolean {
      return Boolean(this.buscapeAppToken && this.buscapeAuthToken);
    },
  },

  priceComparison: {
    mercadoLivre: {
      clientId: process.env.MERCADO_LIVRE_CLIENT_ID || "",
      clientSecret: process.env.MERCADO_LIVRE_CLIENT_SECRET || "",
      get configured(): boolean {
        return Boolean(this.clientId && this.clientSecret);
      },
    },
  },

  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    username: process.env.REDIS_USERNAME || "",
    password: process.env.REDIS_PASSWORD || "",
    db: parseInt(process.env.REDIS_DB || "0", 10),
  },

  apify: {
    apiToken: process.env.APIFY_API_TOKEN || "",
    flightActorId:
      process.env.APIFY_FLIGHT_ACTOR_ID ||
      "johnvc/google-flights-data-scraper-flight-and-price-search",
    requestTimeoutMs: parseInt(process.env.APIFY_REQUEST_TIMEOUT_MS || "30000", 10),
    runTimeoutMs: parseInt(process.env.APIFY_RUN_TIMEOUT_MS || "120000", 10),
    maxResults: parseInt(process.env.APIFY_FLIGHT_MAX_RESULTS || "20", 10),
    get configured(): boolean {
      return Boolean(this.apiToken && this.flightActorId);
    },
  },
};
