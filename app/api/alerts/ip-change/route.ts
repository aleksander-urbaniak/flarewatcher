import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendAlerts } from "@/lib/alerts";

export const runtime = "nodejs";

const payloadSchema = z.object({
  previousIp: z.string().nullable().optional(),
  currentIp: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid payload." },
        { status: 400 }
      );
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    if (!settings?.notifyOnIpChange) {
      return NextResponse.json({ status: "success", skipped: true });
    }

    const { previousIp, currentIp } = parsed.data;
    await sendAlerts(user.id, {
      title: "Flarewatcher IP change",
      body: `Previous IP: ${previousIp ?? "-"}\nCurrent IP: ${currentIp}`,
      previousIp,
      currentIp,
    });

    return NextResponse.json({ status: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }
}
