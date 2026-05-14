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
};
