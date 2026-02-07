import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { getPublicIp } from "@/lib/ip";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSessionUser();
    const ip = await getPublicIp();
    return NextResponse.json({ status: "success", ip });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }
}
