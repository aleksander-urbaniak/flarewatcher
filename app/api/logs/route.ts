import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DEFAULT_TAKE = 100;
const MAX_TAKE = 2000;

const getTake = (request: Request) => {
  const { searchParams } = new URL(request.url);
  const takeParam = Number(searchParams.get("take"));
  if (!Number.isFinite(takeParam) || takeParam <= 0) {
    return DEFAULT_TAKE;
  }
  return Math.min(Math.floor(takeParam), MAX_TAKE);
};

const getSince = (request: Request) => {
  const { searchParams } = new URL(request.url);
  const monthsParam = Number(searchParams.get("months"));
  if (!Number.isFinite(monthsParam) || monthsParam <= 0) {
    return undefined;
  }
  const since = new Date();
  since.setMonth(since.getMonth() - Math.floor(monthsParam));
  return since;
};

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const take = getTake(request);
    const since = getSince(request);

    const [updates, events] = await Promise.all([
      prisma.dnsUpdate.findMany({
        where: {
          actor: user.email,
          ...(since ? { createdAt: { gte: since } } : null),
        },
        orderBy: { createdAt: "desc" },
        take,
      }),
      prisma.auditEvent.findMany({
        where: {
          userId: user.id,
          ...(since ? { createdAt: { gte: since } } : null),
        },
        orderBy: { createdAt: "desc" },
        take,
      }),
    ]);

    return NextResponse.json({
      status: "success",
      updates,
      events,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { status: "error", message: status === 401 ? message : "Request failed." },
      { status }
    );
  }
}

export async function DELETE() {
  try {
    const user = await requireSessionUser();
    const [updateResult, eventResult] = await Promise.all([
      prisma.dnsUpdate.deleteMany({ where: { actor: user.email } }),
      prisma.auditEvent.deleteMany({ where: { userId: user.id } }),
    ]);

    return NextResponse.json({
      status: "success",
      deletedUpdates: updateResult.count,
      deletedEvents: eventResult.count,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { status: "error", message: status === 401 ? message : "Request failed." },
      { status }
    );
  }
}
