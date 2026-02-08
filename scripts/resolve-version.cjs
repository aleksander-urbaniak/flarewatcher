const { execSync } = require("child_process");
const { version: packageVersion } = require("../package.json");

const includeVPrefix = process.argv.includes("--with-v");
const TAG_PATTERN = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

const normalizeSemver = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const fromTag = value.match(TAG_PATTERN);
  if (fromTag) {
    return fromTag[1];
  }

  const plain = value.match(/^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/);
  if (plain) {
    return plain[1];
  }

  return null;
};

const resolveGitTagVersion = () => {
  const refNameVersion = normalizeSemver(process.env.GITHUB_REF_NAME);
  if (refNameVersion) {
    return refNameVersion;
  }

  try {
    const exactTag = execSync("git describe --tags --exact-match", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    return normalizeSemver(exactTag);
  } catch {
    return null;
  }
};

const resolvedVersion = resolveGitTagVersion() ?? normalizeSemver(packageVersion) ?? "0.0.0";
const output = includeVPrefix ? `v${resolvedVersion}` : resolvedVersion;
process.stdout.write(`${output}\n`);

