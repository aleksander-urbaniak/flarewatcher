import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAllUserTokens, verifyToken } from "@/lib/tokens";

export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();
  try {
    const user = await requireSessionUser();

    await prisma.$queryRaw`SELECT 1`;

    let tokens = [] as { id: string; name: string; token: string }[];
    try {
      tokens = await getAllUserTokens(user.id);
    } catch (error) {
      if (error instanceof Error && error.message !== "API_TOKEN_MISSING") {
        throw error;
      }
    }

    const checks = await Promise.allSettled(
      tokens.map(async (token) => ({
        tokenId: token.id,
        name: token.name,
        result: await verifyToken(token.token),
      }))
    );

    const valid = checks.filter((item) => item.status === "fulfilled");
    const invalid = checks.filter((item) => item.status === "rejected");

    return NextResponse.json({
      status: "success",
      db: "ok",
      tokens: {
        total: tokens.length,
        valid: valid.length,
        invalid: invalid.length,
      },
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }
}
