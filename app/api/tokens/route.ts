import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/tokens";
import { logAuditEvent } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

export const runtime = "nodejs";

const tokenSchema = z.object({
  name: z.string().min(2).max(50),
  token: z.string().min(10).max(200),
});

const tokenUpdateSchema = z.object({
  tokenId: z.string().min(1),
  name: z.string().min(2).max(50).optional(),
  token: z.string().min(10).max(200).optional(),
});

export async function GET() {
  try {
    const user = await requireSessionUser();
    const tokens = await prisma.cloudflareToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        status: true,
        missingScopes: true,
        scopes: true,
        lastCheckedAt: true,
      },
    });

    return NextResponse.json({ status: "success", tokens });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { status: "error", message: status === 401 ? message : "Request failed." },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const parsed = tokenSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid token details." },
        { status: 400 }
      );
    }

    const verification = await verifyToken(parsed.data.token.trim());
    const encryptedToken = encryptSecret(parsed.data.token.trim());
    if (!encryptedToken) {
      throw new Error("TOKEN_ENCRYPTION_FAILED");
    }
    const created = await prisma.cloudflareToken.create({
      data: {
        userId: user.id,
        name: parsed.data.name.trim(),
        token: encryptedToken,
        status: verification.status,
        scopes: verification.scopes,
        missingScopes: verification.missingScopes,
        lastCheckedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        status: true,
        missingScopes: true,
        scopes: true,
        lastCheckedAt: true,
      },
    });

    const warning =
      verification.missingScopes.length > 0
        ? `Token saved, but missing scopes: ${verification.missingScopes.join(", ")}`
        : undefined;

    await logAuditEvent({
      userId: user.id,
      action: "token.create",
      targetType: "token",
      targetId: created.id,
      detail: { name: created.name, status: created.status },
    });

    return NextResponse.json({ status: "success", token: created, warning });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { status: "error", message: status === 401 ? message : "Request failed." },
      { status }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get("tokenId");

    if (!tokenId) {
      return NextResponse.json(
        { status: "error", message: "tokenId is required." },
        { status: 400 }
      );
    }

    await prisma.cloudflareToken.deleteMany({
      where: { id: tokenId, userId: user.id },
    });

    await logAuditEvent({
      userId: user.id,
      action: "token.delete",
      targetType: "token",
      targetId: tokenId,
    });

    return NextResponse.json({ status: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { status: "error", message: status === 401 ? message : "Request failed." },
      { status }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get("tokenId");

    if (!tokenId) {
      return NextResponse.json(
        { status: "error", message: "tokenId is required." },
        { status: 400 }
      );
    }

    const token = await prisma.cloudflareToken.findFirst({
      where: { id: tokenId, userId: user.id },
      select: { token: true },
    });

    const decryptedToken = decryptSecret(token?.token);
    if (!decryptedToken) {
      return NextResponse.json(
        { status: "error", message: "Token not found." },
        { status: 404 }
      );
    }

    const verification = await verifyToken(decryptedToken);

    const updated = await prisma.cloudflareToken.update({
      where: { id: tokenId },
      data: {
        status: verification.status,
        scopes: verification.scopes,
        missingScopes: verification.missingScopes,
        lastCheckedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        status: true,
        missingScopes: true,
        scopes: true,
        lastCheckedAt: true,
      },
    });

    await logAuditEvent({
      userId: user.id,
      action: "token.verify",
      targetType: "token",
      targetId: updated.id,
      detail: { status: updated.status, missingScopes: updated.missingScopes },
    });

    return NextResponse.json({ status: "success", token: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { status: "error", message: status === 401 ? message : "Request failed." },
      { status }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const parsed = tokenUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid token update payload." },
        { status: 400 }
      );
    }

    const existing = await prisma.cloudflareToken.findFirst({
      where: { id: parsed.data.tokenId, userId: user.id },
      select: { id: true, token: true },
    });

    if (!existing) {
      return NextResponse.json(
        { status: "error", message: "Token not found." },
        { status: 404 }
      );
    }

    let status = undefined as string | undefined;
    let scopes = undefined as string[] | undefined;
    let missingScopes = undefined as string[] | undefined;
    let lastCheckedAt = undefined as Date | undefined;

    if (parsed.data.token) {
      const verification = await verifyToken(parsed.data.token.trim());
      status = verification.status;
      scopes = verification.scopes;
      missingScopes = verification.missingScopes;
      lastCheckedAt = new Date();
    }

    const updated = await prisma.cloudflareToken.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name.trim() } : null),
        ...(parsed.data.token
          ? (() => {
              const encoded = encryptSecret(parsed.data.token.trim());
              if (!encoded) {
                throw new Error("TOKEN_ENCRYPTION_FAILED");
              }
              return { token: encoded };
            })()
          : null),
        ...(status ? { status } : null),
        ...(scopes ? { scopes } : null),
        ...(missingScopes ? { missingScopes } : null),
        ...(lastCheckedAt ? { lastCheckedAt } : null),
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        status: true,
        missingScopes: true,
        scopes: true,
        lastCheckedAt: true,
      },
    });

    await logAuditEvent({
      userId: user.id,
      action: "token.update",
      targetType: "token",
      targetId: updated.id,
      detail: { name: updated.name, status: updated.status },
    });

    return NextResponse.json({ status: "success", token: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { status: "error", message: status === 401 ? message : "Request failed." },
      { status }
    );
  }
}
