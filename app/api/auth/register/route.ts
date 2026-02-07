import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  buildSessionToken,
  getSessionExpiry,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const registerSchema = z.object({
  username: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  confirmPassword: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = rateLimit(`register:${ip}`, 5, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { status: "error", message: "Too many registration attempts. Try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSec) },
        }
      );
    }

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid registration details." },
        { status: 400 }
      );
    }

    const { username, email, password, confirmPassword } = parsed.data;
    if (password !== confirmPassword) {
      return NextResponse.json(
        { status: "error", message: "Passwords do not match." },
        { status: 400 }
      );
    }

    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { status: "error", message: "Setup already completed." },
        { status: 403 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        email: email.toLowerCase(),
        passwordHash,
        isAdmin: true,
      },
    });

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
      action: "auth.register",
      detail: { isAdmin: true },
    });

    return NextResponse.json({
      status: "success",
      message: "Admin account created.",
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed.";
    return NextResponse.json(
      { status: "error", message },
      { status: 500 }
    );
  }
}
