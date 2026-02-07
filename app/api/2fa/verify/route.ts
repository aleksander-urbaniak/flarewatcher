import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyTwoFactorToken } from "@/lib/twoFactor";
import { logAuditEvent } from "@/lib/audit";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(6).max(8),
});

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = rateLimit(`2fa-verify:${ip}`, 10, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { status: "error", message: "Too many requests. Try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSec) },
        }
      );
    }
    const user = await requireSessionUser();
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid code." },
        { status: 400 }
      );
    }

    const current = await prisma.user.findUnique({
      where: { id: user.id },
      select: { twoFactorTempSecret: true, twoFactorEnabled: true },
    });

    if (!current?.twoFactorTempSecret) {
      return NextResponse.json(
        { status: "error", message: "No pending 2FA setup." },
        { status: 400 }
      );
    }

    const valid = verifyTwoFactorToken(parsed.data.token, current.twoFactorTempSecret);
    if (!valid) {
      return NextResponse.json(
        { status: "error", message: "Invalid code." },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: current.twoFactorTempSecret,
        twoFactorTempSecret: null,
      },
    });

    await logAuditEvent({
      userId: user.id,
      action: "2fa.enabled",
      detail: { method: "totp" },
    });

    return NextResponse.json({ status: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "2FA verification failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }
}
