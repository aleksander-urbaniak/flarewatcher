const { spawnSync } = require("child_process");

const isFixAvailable = (fixAvailable) =>
  fixAvailable === true ||
  (typeof fixAvailable === "object" && fixAvailable !== null);

const npmExecPath = process.env.npm_execpath;

if (!npmExecPath) {
  process.stderr.write("npm_execpath is not available in environment.\n");
  process.exit(1);
}

const result = spawnSync(process.execPath, [npmExecPath, "audit", "--omit=dev", "--json"], {
  encoding: "utf8",
});

const reportText = result.stdout?.trim();
if (!reportText) {
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.stderr.write("npm audit did not return JSON output.\n");
  process.exit(result.status ?? 1);
}

let report;
try {
  report = JSON.parse(reportText);
} catch (error) {
  process.stderr.write("Unable to parse npm audit JSON output.\n");
  process.stderr.write(String(error));
  process.stderr.write("\n");
  process.exit(1);
}

const vulnerabilities = Object.entries(report.vulnerabilities ?? {});
const blocking = vulnerabilities.filter(([, vulnerability]) => {
  if (!vulnerability || typeof vulnerability !== "object") {
    return false;
  }

  const severity = String(vulnerability.severity ?? "").toLowerCase();
  if (severity !== "high" && severity !== "critical") {
    return false;
  }

  return isFixAvailable(vulnerability.fixAvailable);
});

if (blocking.length > 0) {
  process.stderr.write(
    "Fixable HIGH/CRITICAL production vulnerabilities detected by npm audit:\n"
  );
  for (const [name, vulnerability] of blocking) {
    process.stderr.write(`- ${name} (${vulnerability.severity})\n`);
  }
  process.exit(1);
}

process.stdout.write(
  "No fixable HIGH/CRITICAL production vulnerabilities found in npm audit.\n"
);
