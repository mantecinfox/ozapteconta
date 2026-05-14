const baseUrl = (process.env.DEPLOY_URL || process.env.FRONTEND_URL || "").replace(/\/$/, "");

if (!baseUrl) {
  console.error("Defina DEPLOY_URL ou FRONTEND_URL com a URL publica HTTPS do deploy.");
  process.exit(1);
}

if (!baseUrl.startsWith("https://")) {
  console.error("A URL publica do deploy deve usar HTTPS.");
  process.exit(1);
}

async function request(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json,text/html" },
  });

  if (!response.ok) {
    throw new Error(`${url} retornou HTTP ${response.status}`);
  }

  return response;
}

async function main() {
  const healthResponse = await request(`${baseUrl}/api/health`);
  const health = await healthResponse.json();

  if (health.status !== "ok") {
    throw new Error(`/api/health respondeu status inesperado: ${JSON.stringify(health)}`);
  }

  const frontendResponse = await request(baseUrl);
  const html = await frontendResponse.text();

  if (!html.includes("<!doctype html") && !html.includes("<!DOCTYPE html")) {
    throw new Error("Frontend nao retornou HTML do app React.");
  }

  console.log("OK - Deploy responde em HTTPS, /api/health e frontend.");
  console.log("Checklist manual restante: login/admin, webhook WhatsApp e persistencia de storage.");
}

main().catch((error) => {
  console.error(`Falha na validacao do deploy: ${error.message}`);
  process.exit(1);
});
