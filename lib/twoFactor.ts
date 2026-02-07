import { generateSecret, generateURI, verifySync } from "otplib";

export function generateTwoFactorSecret(label: string) {
  const secret = generateSecret();
  const otpauth = generateURI({ issuer: "Flarewatcher", label, secret });
  return { secret, otpauth };
}

export function verifyTwoFactorToken(token: string, secret: string) {
  const result = verifySync({ token, secret, epochTolerance: 30 });
  return result.valid;
}
