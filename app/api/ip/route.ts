import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { getPublicIp } from "@/lib/ip";
import { prisma } from "@/lib/prisma";
import { getUserDnsUpdateWhere } from "@/lib/updateAccess";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const ip = await getPublicIp();
    const userUpdateWhere = await getUserDnsUpdateWhere(user.id, user.email);
    const latestUpdate = await prisma.dnsUpdate.findFirst({
      where: {
        AND: [
          userUpdateWhere,
          { status: "success" },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        previousContent: true,
        content: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      status: "success",
      ip,
      previousIp:
        latestUpdate?.content === ip ? latestUpdate.previousContent : null,
      lastSyncedIp: latestUpdate?.content ?? null,
      lastSyncedAt: latestUpdate?.createdAt ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }
}
