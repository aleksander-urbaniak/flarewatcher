import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DEFAULT_MONTHS = 6;
const MAX_TAKE = 500;

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const monthsParam = Number(searchParams.get("months"));
    const months =
      Number.isFinite(monthsParam) && monthsParam > 0
        ? Math.floor(monthsParam)
        : DEFAULT_MONTHS;

    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const events = await prisma.ipChangeEvent.findMany({
      where: {
        userId: user.id,
        detectedAt: { gte: since },
      },
      orderBy: { detectedAt: "desc" },
      take: MAX_TAKE,
      select: {
        id: true,
        previousIp: true,
        newIp: true,
        detectedAt: true,
      },
    });

    return NextResponse.json({ events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { status: "error", message: status === 401 ? message : "Request failed." },
      { status }
    );
  }
}
