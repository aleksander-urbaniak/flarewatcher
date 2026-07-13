import { generateSecret, generateURI, verifySync } from "otplib";

export function generateTwoFactorSecret(label: string) {
  const secret = generateSecret();
  const otpauth = generateURI({ issuer: "Flarewatcher", label, secret });
  return { secret, otpauth };
}

// Verifies a TOTP code. Pass `afterTimeStep` (the last accepted step for this
// user) to reject a code that has already been used, since otplib's own
// epoch tolerance would otherwise let the same code succeed repeatedly for
// up to ~90s.
export function verifyTwoFactorToken(
  token: string,
  secret: string,
  afterTimeStep?: number | null
): { valid: boolean; timeStep: number | null } {
  const result = verifySync({
    token,
    secret,
    epochTolerance: 30,
    ...(typeof afterTimeStep === "number" ? { afterTimeStep } : null),
  });
  if (!result.valid) {
    return { valid: false, timeStep: null };
  }
  // otplib's top-level VerifyResult type covers both TOTP and HOTP
  // strategies; `timeStep` only exists on the TOTP variant (which is what we
  // always use here), so narrow it defensively rather than asserting it.
  const timeStep = "timeStep" in result ? result.timeStep : null;
  return { valid: true, timeStep };
}
