import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/lib/secrets";

export const REQUIRED_PERMISSIONS = ["Zone:Read", "Zone:DNS:Edit"] as const;

const normalizePermission = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ":")
    .replace(/:+/g, ":")
    .replace(/^:|:$/g, "");

const hasZoneRead = (scopes: string[]) =>
  scopes.some((scope) => {
    const normalized = normalizePermission(scope);
    return normalized.includes("zone") && (normalized.includes("read") || normalized.includes("view"));
  });

const hasDnsEdit = (scopes: string[]) =>
  scopes.some((scope) => {
    const normalized = normalizePermission(scope);
    return normalized.includes("dns") && (normalized.includes("edit") || normalized.includes("write"));
  });

type TokenInfo = {
  status: string;
  scopes: string[];
  missingScopes: string[];
};

export type CloudflareTokenRecord = {
  id: string;
  name: string;
  token: string;
  missingScopes: Prisma.JsonValue;
  status: string;
};

export async function getUserTokenById(userId: string, tokenId: string) {
  const token = await prisma.cloudflareToken.findFirst({
    where: { id: tokenId, userId },
    select: { id: true, token: true },
  });

  if (!token?.token) {
    throw new Error("API_TOKEN_MISSING");
  }

  const decrypted = decryptSecret(token.token);
  if (!decrypted) {
    throw new Error("API_TOKEN_MISSING");
  }

  if (!isEncryptedSecret(token.token)) {
    const encrypted = encryptSecret(decrypted);
    if (encrypted && encrypted !== token.token) {
      await prisma.cloudflareToken.updateMany({
        where: { id: token.id, userId },
        data: { token: encrypted },
      });
    }
  }

  return decrypted;
}

export async function getAllUserTokens(
  userId: string
): Promise<CloudflareTokenRecord[]> {
  const tokens = await prisma.cloudflareToken.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      token: true,
      missingScopes: true,
      status: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (tokens.length === 0) {
    throw new Error("API_TOKEN_MISSING");
  }

  const mapped = tokens.map((entry) => {
    const decrypted = decryptSecret(entry.token);
    if (!decrypted) {
      throw new Error("API_TOKEN_MISSING");
    }
    return {
      ...entry,
      token: decrypted,
    };
  });

  await Promise.allSettled(
    tokens
      .filter((entry) => !isEncryptedSecret(entry.token))
      .map(async (entry) => {
        const encrypted = encryptSecret(entry.token);
        if (encrypted && encrypted !== entry.token) {
          await prisma.cloudflareToken.updateMany({
            where: { id: entry.id, userId },
            data: { token: encrypted },
          });
        }
      })
  );

  return mapped;
}

export async function verifyToken(token: string): Promise<TokenInfo> {
  const response = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const data = (await response.json()) as {
    success?: boolean;
    errors?: { message: string }[];
    result?: {
      status?: string;
      policies?: {
        permission_groups?: { name?: string }[];
      }[];
    };
  };

  if (!data.success || !data.result) {
    const message = data.errors?.[0]?.message || "Token verification failed.";
    throw new Error(message);
  }

  const scopes = Array.from(
    new Set(
      (data.result.policies ?? [])
        .flatMap((policy) => policy.permission_groups ?? [])
        .map((group) => group.name)
        .filter((name): name is string => Boolean(name))
    )
  );

  let missingScopes: string[] = [];
  if (scopes.length > 0) {
    if (!hasZoneRead(scopes)) {
      missingScopes.push("Zone:Read");
    }
    if (!hasDnsEdit(scopes)) {
      missingScopes.push("Zone:DNS:Edit");
    }
  }

  return {
    status: data.result.status ?? "unknown",
    scopes,
    missingScopes,
  };
}
