const requiredVars = [
  "NODE_ENV",
  "DATABASE_URL",
  "JWT_SECRET",
  "FRONTEND_URL",
];

const recommendedVars = [
  "AUDIO_STORAGE_PATH",
  "REPORTS_STORAGE_PATH",
  "LOG_FILE",
];

const missing = requiredVars.filter((key) => !process.env[key]);
const weakSecrets = [];

if (process.env.NODE_ENV && process.env.NODE_ENV !== "production") {
  weakSecrets.push("NODE_ENV deve ser production no ambiente da Hostinger.");
}

if (
  process.env.JWT_SECRET &&
  (process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET.includes("TROQUE") ||
    process.env.JWT_SECRET.includes("change_this_secret"))
) {
  weakSecrets.push("JWT_SECRET deve ter pelo menos 32 caracteres e nao pode ser o valor de exemplo.");
}

if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("postgresql://")) {
  weakSecrets.push("DATABASE_URL deve usar o formato postgresql://USUARIO:SENHA@HOST:PORTA/BANCO.");
}

if (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.startsWith("https://")) {
  weakSecrets.push("FRONTEND_URL deve usar https:// em producao.");
}

if (missing.length > 0 || weakSecrets.length > 0) {
  console.error("Ambiente Hostinger incompleto:");
  missing.forEach((key) => console.error(`- Variavel obrigatoria ausente: ${key}`));
  weakSecrets.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

const missingRecommended = recommendedVars.filter((key) => !process.env[key]);

console.log("OK - Variaveis obrigatorias da Hostinger validadas.");

if (missingRecommended.length > 0) {
  console.log(
    `Aviso - configure storage/log persistente quando possivel: ${missingRecommended.join(", ")}`
  );
}
