import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth";
import { getUserDnsUpdateWhere } from "@/lib/updateAccess";

export const runtime = "nodejs";

const DEFAULT_TAKE = 15;
const MAX_TAKE = 2000;

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const monthsParam = Number(searchParams.get("months"));
    const takeParam = Number(searchParams.get("take"));

    const hasMonths = Number.isFinite(monthsParam) && monthsParam > 0;
    const hasTake = Number.isFinite(takeParam) && takeParam > 0;

    const take = Math.min(
      hasTake ? Math.floor(takeParam) : hasMonths ? MAX_TAKE : DEFAULT_TAKE,
      MAX_TAKE
    );

    const userUpdateWhere = await getUserDnsUpdateWhere(user.id, user.email);
    const where = (() => {
      if (!hasMonths) {
        return userUpdateWhere;
      }
      const since = new Date();
      since.setMonth(since.getMonth() - Math.floor(monthsParam));
      return {
        AND: [
          userUpdateWhere,
          {
            createdAt: { gte: since },
          },
        ],
      };
    })();

    const updates = await prisma.dnsUpdate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
    });

    return NextResponse.json({ updates });
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
    const userUpdateWhere = await getUserDnsUpdateWhere(user.id, user.email);
    const result = await prisma.dnsUpdate.deleteMany({
      where: userUpdateWhere,
    });
    return NextResponse.json({
      status: "success",
      deleted: result.count,
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
