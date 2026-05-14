const { spawnSync } = require("child_process");
const path = require("path");

const backendDir = path.resolve(__dirname, "..", "backend");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: backendDir,
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    throw new Error(`Falha ao executar: ${command} ${args.join(" ")}`);
  }
}

run("npm", ["run", "prisma:generate"]);
run("npx", ["prisma", "db", "push"]);

try {
  run("npm", ["run", "prisma:seed"]);
} catch (_error) {
  console.log("Aviso: seed nao foi aplicada. Continuando setup.");
}

console.log("OK - Banco sincronizado com Prisma");
