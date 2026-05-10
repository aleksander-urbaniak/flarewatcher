import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { syncDdnsRecords } from "@/lib/ddns";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireSessionUser();
    const result = await syncDdnsRecords({
      userId: user.id,
      actor: user.email,
    });

    return NextResponse.json({
      status: result.recordsFailed > 0 ? "partial" : "success",
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }
}
