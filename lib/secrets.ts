import crypto from "crypto";

const ENCRYPTED_PREFIX = "enc:v1:";

const getSecretKey = () => {
  const raw = process.env.SECRET_ENCRYPTION_KEY?.trim();
  if (!raw) {
    return null;
  }
  // Derive a stable 32-byte key from the configured secret.
  return crypto.createHash("sha256").update(raw).digest();
};

const ensureKeyForEncryption = () => {
  const key = getSecretKey();
  if (!key && process.env.NODE_ENV === "production") {
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
  if (!key) {
    return value;
  }

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
