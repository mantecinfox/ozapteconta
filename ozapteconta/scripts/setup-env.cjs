const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
const frontendDir = path.join(rootDir, "frontend");

const backendEnvExample = path.join(backendDir, ".env.example");
const backendEnv = path.join(backendDir, ".env");
const frontendEnv = path.join(frontendDir, ".env");

function upsertLine(content, key, value) {
  const line = `${key}=${value}`;
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    return content.replace(regex, line);
  }
  return content.endsWith("\n") ? `${content}${line}\n` : `${content}\n${line}\n`;
}

function ensureBackendEnv() {
  let content = "";

  if (fs.existsSync(backendEnv)) {
    content = fs.readFileSync(backendEnv, "utf8");
  } else if (fs.existsSync(backendEnvExample)) {
    content = fs.readFileSync(backendEnvExample, "utf8");
  } else {
    throw new Error("Arquivo backend/.env.example nao encontrado.");
  }

  content = upsertLine(content, "NODE_ENV", "development");
  content = upsertLine(content, "PORT", "3001");
  content = upsertLine(
    content,
    "DATABASE_URL",
    "postgresql://financebot:Tra1302@localhost:5432/financebot"
  );
  content = upsertLine(content, "FRONTEND_URL", "http://localhost:5173");

  fs.writeFileSync(backendEnv, content, "utf8");
  console.log("OK - backend/.env configurado");
}

function ensureFrontendEnv() {
  let content = "";
  if (fs.existsSync(frontendEnv)) {
    content = fs.readFileSync(frontendEnv, "utf8");
  }

  content = upsertLine(content, "VITE_API_URL", "http://localhost:3001");
  fs.writeFileSync(frontendEnv, content, "utf8");
  console.log("OK - frontend/.env configurado");
}

ensureBackendEnv();
ensureFrontendEnv();
