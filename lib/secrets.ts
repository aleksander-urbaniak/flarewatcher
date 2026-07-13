import crypto from "crypto";

const ENCRYPTED_PREFIX = "enc:v1:";
const MIN_KEY_LENGTH = 32;
// Fixed, app-specific salt: SECRET_ENCRYPTION_KEY is the only secret input we
// have, so the salt's job is domain separation, not per-install randomness.
const KDF_SALT = "flarewatcher:secret-key:v1";

let cachedKey: Buffer | null | undefined;

const getSecretKey = () => {
  if (cachedKey !== undefined) {
    return cachedKey;
  }

  const raw = process.env.SECRET_ENCRYPTION_KEY?.trim();
  if (!raw) {
    cachedKey = null;
    return cachedKey;
  }
  if (raw.length < MIN_KEY_LENGTH) {
    throw new Error(
      `SECRET_ENCRYPTION_KEY_TOO_SHORT: must be at least ${MIN_KEY_LENGTH} characters`
    );
  }

  // scrypt gives the passphrase a real work factor, unlike a bare hash.
  cachedKey = crypto.scryptSync(raw, KDF_SALT, 32);
  return cachedKey;
};

const ensureKeyForEncryption = () => {
  const key = getSecretKey();
  if (!key) {
    throw new Error("SECRET_ENCRYPTION_KEY_MISSING");
  }
  return key;
};

export const isEncryptedSecret = (value: string | null | undefined) =>
  Boolean(value && value.startsWith(ENCRYPTED_PREFIX));

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
  return `${ENCRYPTED_PREFIX}${payload}`;
};

export const decryptSecret = (value: string | null | undefined) => {
  if (value === null || value === undefined || value.length === 0) {
    return null;
  }
  if (!isEncryptedSecret(value)) {
    return value;
  }

  const key = getSecretKey();
  if (!key) {
    throw new Error("SECRET_ENCRYPTION_KEY_MISSING");
  }

  const payload = value.slice(ENCRYPTED_PREFIX.length);
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
