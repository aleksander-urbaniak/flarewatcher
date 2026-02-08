const { spawn, spawnSync } = require("child_process");

const runMigrations = spawnSync(process.execPath, ["scripts/run-migrations.cjs"], {
  stdio: "inherit",
  env: process.env,
});

if (runMigrations.status !== 0) {
  process.exit(runMigrations.status ?? 1);
}

const nextBin = require.resolve("next/dist/bin/next");
const server = spawn(process.execPath, [nextBin, "start"], {
  stdio: "inherit",
  env: process.env,
});

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => {
    if (!server.killed) {
      server.kill(signal);
    }
  });
});

server.on("exit", (code) => {
  process.exit(code ?? 0);
});

