const { spawn } = require("node:child_process");

const maxAttempts = Number(process.env.EXPO_TUNNEL_ATTEMPTS ?? 6);
const retryDelayMs = Number(process.env.EXPO_TUNNEL_RETRY_MS ?? 5000);
const args = ["start", "--go", "--tunnel", "--port", process.env.EXPO_PORT ?? "8081"];

let attempt = 0;
let child = null;
let shuttingDown = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runExpo() {
  attempt += 1;

  if (attempt > 1) {
    console.log(`\nTentando reabrir o tunnel do Expo (${attempt}/${maxAttempts})...\n`);
  }

  child = spawn("expo", args, {
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  child.on("exit", async (code, signal) => {
    child = null;

    if (shuttingDown || signal === "SIGINT" || signal === "SIGTERM" || code === 0) {
      process.exit(code ?? 0);
    }

    if (attempt >= maxAttempts) {
      console.error(
        `\nExpo tunnel falhou ${maxAttempts} vezes. Tente novamente em alguns minutos ou confira https://status.ngrok.com/.\n`
      );
      process.exit(code ?? 1);
    }

    console.error(`\nExpo tunnel caiu com código ${code}. Nova tentativa em ${retryDelayMs / 1000}s...\n`);
    await wait(retryDelayMs);
    runExpo();
  });
}

function stop(signal) {
  shuttingDown = true;

  if (child) {
    child.kill(signal);
  } else {
    process.exit(0);
  }
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

runExpo();
