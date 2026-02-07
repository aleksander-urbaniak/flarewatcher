import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireSessionUser();
    return NextResponse.json({
      status: "success",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }
}
