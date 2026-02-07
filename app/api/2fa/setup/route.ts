import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateTwoFactorSecret } from "@/lib/twoFactor";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = rateLimit(`2fa-setup:${ip}`, 10, 60_000);
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
    if (user.twoFactorEnabled) {
      return NextResponse.json(
        { status: "error", message: "2FA already enabled." },
        { status: 400 }
      );
    }

    const { secret, otpauth } = generateTwoFactorSecret(user.email);
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorTempSecret: secret },
    });

    return NextResponse.json({
      status: "success",
      secret,
      otpauth,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "2FA setup failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }
}
