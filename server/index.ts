import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.set("trust proxy", 1);

  // Vite emits static assets to /build; the bundled server lives in /dist.
  const staticPath = path.resolve(__dirname, "..", "build");

  app.use(express.static(staticPath));

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "ozapteajuda" });
  });

  // SPA fallback for client-side routes (wouter)
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "0.0.0.0";

  server.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}/`);
  });
}

startServer().catch(console.error);
