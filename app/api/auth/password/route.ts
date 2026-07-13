import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  getSessionCookie,
  hashPassword,
  requireSessionUser,
  verifyPassword,
} from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import {
  clearFailures,
  getClientIp,
  getLockout,
  rateLimit,
  recordFailure,
} from "@/lib/rateLimit";

export const runtime = "nodejs";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
  confirmPassword: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = rateLimit(`password-change:${ip}`, 10, 60_000);
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
    const identityKey = `password-change:${user.id}`;
    const lock = getLockout(identityKey);
    if (lock.locked) {
      return NextResponse.json(
        { status: "error", message: "Too many attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(lock.retryAfterSec) },
        }
      );
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid password details." },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword, confirmPassword } = parsed.data;
    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { status: "error", message: "New passwords do not match." },
        { status: 400 }
      );
    }

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      recordFailure(identityKey, {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000,
        lockMs: 15 * 60 * 1000,
      });
      return NextResponse.json(
        { status: "error", message: "Current password is incorrect." },
        { status: 401 }
      );
    }
    clearFailures(identityKey);

    const passwordHash = await hashPassword(newPassword);
    const currentToken = await getSessionCookie();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      // Changing the password invalidates every other session so a
      // previously stolen session cookie stops working immediately.
      prisma.session.deleteMany({
        where: {
          userId: user.id,
          ...(currentToken ? { token: { not: currentToken } } : {}),
        },
      }),
    ]);

    await logAuditEvent({
      userId: user.id,
      action: "auth.password_change",
    });

    return NextResponse.json({ status: "success", message: "Password updated." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Password update failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }
}
