import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendAlerts } from "@/lib/alerts";
import { recordIpChange } from "@/lib/ddns";

export const runtime = "nodejs";

const IP_REGEX =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}|(?:[\da-fA-F]{1,4}:){1,7}[\da-fA-F]{1,4})$/;

const payloadSchema = z.object({
  previousIp: z.string().regex(IP_REGEX).nullable().optional(),
  currentIp: z.string().regex(IP_REGEX),
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

    const { previousIp, currentIp } = parsed.data;

    // Always record the change (for timeline), then check notification setting.
    const isNew = await recordIpChange(
      user.id,
      previousIp ?? undefined,
      currentIp
    );

    if (isNew) {
      const settings = await prisma.userSettings.findUnique({
        where: { userId: user.id },
        select: { notifyOnIpChange: true },
      });
      if (settings?.notifyOnIpChange) {
        await sendAlerts(user.id, {
          title: "Flarewatcher IP change",
          body: `Previous IP: ${previousIp ?? "-"}\nCurrent IP: ${currentIp}`,
          previousIp,
          currentIp,
        });
      }
    }

    return NextResponse.json({ status: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }
}
