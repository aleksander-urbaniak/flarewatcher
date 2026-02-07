import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { clearSessionCookie, getSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const token = await getSessionCookie();
  if (token) {
    await prisma.session.deleteMany({ where: { token } }).catch(() => null);
  }

  await clearSessionCookie();

  return NextResponse.json({ status: "success" });
}
