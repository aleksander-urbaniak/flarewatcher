const { spawnSync } = require("child_process");

const BASELINE_MIGRATION = process.env.PRISMA_BASELINE_MIGRATION || "202602070001_init";
const NON_EMPTY_SCHEMA_PATTERN = /P3005|database schema is not empty|already exists/i;
const PRISMA_CLI = require.resolve("prisma/build/index.js");

const runPrisma = (args, stdio = "pipe") =>
  spawnSync(process.execPath, [PRISMA_CLI, ...args], {
    stdio,
    encoding: "utf8",
  });

const outputText = (result) => `${result.stdout ?? ""}${result.stderr ?? ""}`;

const printOutput = (result) => {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
};

const deploy = runPrisma(["migrate", "deploy"]);
printOutput(deploy);

if (deploy.status === 0) {
  process.exit(0);
}

if (!NON_EMPTY_SCHEMA_PATTERN.test(outputText(deploy))) {
  process.exit(deploy.status ?? 1);
}

process.stdout.write(
  `\nDetected pre-migration schema. Marking baseline migration '${BASELINE_MIGRATION}' as applied.\n`
);

const resolve = runPrisma(["migrate", "resolve", "--applied", BASELINE_MIGRATION], "inherit");
if (resolve.status !== 0) {
  process.exit(resolve.status ?? 1);
}

const deployAfterResolve = runPrisma(["migrate", "deploy"], "inherit");
process.exit(deployAfterResolve.status ?? 1);
