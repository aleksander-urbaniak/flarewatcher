import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  buildSessionToken,
  getSessionExpiry,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { verifyTwoFactorToken } from "@/lib/twoFactor";
import { logAuditEvent } from "@/lib/audit";
import { clearFailures, getClientIp, getLockout, rateLimit, recordFailure } from "@/lib/rateLimit";

export const runtime = "nodejs";
const DUMMY_PASSWORD_HASH =
  "$2b$12$/qneo.6Q9CV2pckM5KARcub9jWPZ1.jyXFsfrto3XDteKfkCWCyve";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  twoFactorToken: z.string().min(6).max(8).optional(),
});

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = rateLimit(`login:${ip}`, 10, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { status: "error", message: "Too many login attempts. Try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSec) },
        }
      );
    }

    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid login details." },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const identityKey = `login:${ip}:${email.toLowerCase()}`;
    const lock = getLockout(identityKey);
    if (lock.locked) {
      return NextResponse.json(
        { status: "error", message: "Account temporarily locked. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(lock.retryAfterSec) },
        }
      );
    }
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      recordFailure(identityKey, {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000,
        lockMs: 15 * 60 * 1000,
      });
      return NextResponse.json(
        { status: "error", message: "Invalid email or password." },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      recordFailure(identityKey, {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000,
        lockMs: 15 * 60 * 1000,
      });
      return NextResponse.json(
        { status: "error", message: "Invalid email or password." },
        { status: 401 }
      );
    }

    if (user.twoFactorEnabled) {
      if (!parsed.data.twoFactorToken) {
        return NextResponse.json(
          { status: "two_factor_required", message: "Two-factor code required." },
          { status: 401 }
        );
      }
      if (!user.twoFactorSecret) {
        return NextResponse.json(
          { status: "error", message: "Two-factor setup is incomplete." },
          { status: 401 }
        );
      }
      const valid2fa = verifyTwoFactorToken(
        parsed.data.twoFactorToken,
        user.twoFactorSecret
      );
      if (!valid2fa) {
        recordFailure(identityKey, {
          maxAttempts: 5,
          windowMs: 15 * 60 * 1000,
          lockMs: 15 * 60 * 1000,
        });
        return NextResponse.json(
          { status: "error", message: "Invalid two-factor code." },
          { status: 401 }
        );
      }
    }

    clearFailures(identityKey);
    const token = buildSessionToken();
    const expiresAt = getSessionExpiry();
    await prisma.session.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    await setSessionCookie(token, expiresAt);
    await logAuditEvent({
      userId: user.id,
      action: "auth.login",
      detail: { twoFactor: user.twoFactorEnabled },
    });

    return NextResponse.json({
      status: "success",
      message: "Logged in.",
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch {
    return NextResponse.json(
      { status: "error", message: "Login failed." },
      { status: 500 }
    );
  }
}
