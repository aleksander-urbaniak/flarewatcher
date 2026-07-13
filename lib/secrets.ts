import crypto from "crypto";

// enc:v1: = SHA-256 derived key (legacy, v1.0.x)
// enc:v2: = scrypt derived key (current, v1.1.x+)
const ENCRYPTED_PREFIX_V1 = "enc:v1:";
const ENCRYPTED_PREFIX_V2 = "enc:v2:";
const MIN_KEY_LENGTH = 32;
// Fixed, app-specific salt: SECRET_ENCRYPTION_KEY is the only secret input we
// have, so the salt's job is domain separation, not per-install randomness.
const KDF_SALT = "flarewatcher:secret-key:v1";

let cachedScryptKey: Buffer | null | undefined;
let cachedLegacyKey: Buffer | null | undefined;

const getRaw = () => process.env.SECRET_ENCRYPTION_KEY?.trim();

const getSecretKey = () => {
  if (cachedScryptKey !== undefined) {
    return cachedScryptKey;
  }

  const raw = getRaw();
  if (!raw) {
    cachedScryptKey = null;
    return cachedScryptKey;
  }
  if (raw.length < MIN_KEY_LENGTH) {
    throw new Error(
      `SECRET_ENCRYPTION_KEY_TOO_SHORT: must be at least ${MIN_KEY_LENGTH} characters`
    );
  }

  // scrypt gives the passphrase a real work factor, unlike a bare hash.
  cachedScryptKey = crypto.scryptSync(raw, KDF_SALT, 32);
  return cachedScryptKey;
};

// Legacy SHA-256 key used by v1.0.x — needed to decrypt tokens encrypted before v1.1.0.
const getLegacyKey = () => {
  if (cachedLegacyKey !== undefined) {
    return cachedLegacyKey;
  }
  const raw = getRaw();
  if (!raw) {
    cachedLegacyKey = null;
    return cachedLegacyKey;
  }
  cachedLegacyKey = crypto.createHash("sha256").update(raw).digest();
  return cachedLegacyKey;
};

const ensureKeyForEncryption = () => {
  const key = getSecretKey();
  if (!key) {
    throw new Error("SECRET_ENCRYPTION_KEY_MISSING");
  }
  return key;
};

export const isEncryptedSecret = (value: string | null | undefined) =>
  Boolean(
    value &&
      (value.startsWith(ENCRYPTED_PREFIX_V1) ||
        value.startsWith(ENCRYPTED_PREFIX_V2))
  );

// True only for tokens encrypted with the legacy SHA-256 scheme (needs migration).
export const isLegacyEncryptedSecret = (value: string | null | undefined) =>
  Boolean(value && value.startsWith(ENCRYPTED_PREFIX_V1));

export const encryptSecret = (value: string | null | undefined) => {
  if (value === null || value === undefined || value.length === 0) {
    return null;
  }
  if (isEncryptedSecret(value)) {
    return value;
  }

  const key = ensureKeyForEncryption();

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const payload = `${iv.toString("base64url")}.${authTag.toString(
    "base64url"
  )}.${ciphertext.toString("base64url")}`;
  return `${ENCRYPTED_PREFIX_V2}${payload}`;
};

export const decryptSecret = (value: string | null | undefined) => {
  if (value === null || value === undefined || value.length === 0) {
    return null;
  }

  const isV1 = value.startsWith(ENCRYPTED_PREFIX_V1);
  const isV2 = value.startsWith(ENCRYPTED_PREFIX_V2);
  if (!isV1 && !isV2) {
    return value;
  }

  const key = isV2 ? getSecretKey() : getLegacyKey();
  if (!key) {
    throw new Error("SECRET_ENCRYPTION_KEY_MISSING");
  }

  const prefix = isV2 ? ENCRYPTED_PREFIX_V2 : ENCRYPTED_PREFIX_V1;
  const payload = value.slice(prefix.length);
  const [ivEncoded, authTagEncoded, ciphertextEncoded] = payload.split(".");
  if (!ivEncoded || !authTagEncoded || !ciphertextEncoded) {
    throw new Error("SECRET_DECRYPTION_FAILED");
  }

  try {
    const iv = Buffer.from(ivEncoded, "base64url");
    const authTag = Buffer.from(authTagEncoded, "base64url");
    const ciphertext = Buffer.from(ciphertextEncoded, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error("SECRET_DECRYPTION_FAILED");
  }
};
