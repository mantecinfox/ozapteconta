const { spawnSync } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Falha ao executar: ${command} ${args.join(" ")}`);
  }
}

function runNpm(args, cwd) {
  if (process.platform === "win32") {
    run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm", ...args], cwd);
    return;
  }

  run("npm", args, cwd);
}

run(process.execPath, [path.join(rootDir, "scripts", "validate-hostinger-env.cjs")], rootDir);
runNpm(["run", "prisma:generate"], backendDir);
runNpm(["run", "prisma:push"], backendDir);

if (process.env.RUN_PRISMA_SEED === "true") {
  runNpm(["run", "prisma:seed"], backendDir);
} else {
  console.log("Seed nao executado. Defina RUN_PRISMA_SEED=true para popular dados iniciais.");
}

console.log("OK - Banco PostgreSQL sincronizado para o primeiro deploy.");
