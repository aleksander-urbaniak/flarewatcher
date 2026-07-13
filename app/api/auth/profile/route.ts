import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";

const schema = z.object({
  username: z.string().min(2).max(50),
  email: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid profile details." },
        { status: 400 }
      );
    }

    const username = parsed.data.username.trim();
    const email = parsed.data.email.trim().toLowerCase();

    let updated;
    try {
      updated = await prisma.user.update({
        where: { id: user.id },
        data: { username, email },
        select: { id: true, username: true, email: true },
      });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === "P2002") {
        return NextResponse.json(
          { status: "error", message: "Email address is already in use." },
          { status: 409 }
        );
      }
      throw error;
    }

    await logAuditEvent({
      userId: user.id,
      action: "auth.profile_update",
      detail: { username, email },
    });

    return NextResponse.json({ status: "success", user: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Profile update failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }
}
