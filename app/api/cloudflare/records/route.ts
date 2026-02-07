import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { getUserTokenById } from "@/lib/tokens";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();

    const { searchParams } = new URL(request.url);
    const zoneId = searchParams.get("zoneId");
    const tokenId = searchParams.get("tokenId");
    if (!zoneId) {
      return NextResponse.json(
        { status: "error", message: "zoneId is required." },
        { status: 400 }
      );
    }
    if (!tokenId) {
      return NextResponse.json(
        { status: "error", message: "tokenId is required." },
        { status: 400 }
      );
    }

    const token = await getUserTokenById(user.id, tokenId);

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    const data = (await response.json()) as {
      success?: boolean;
      errors?: { message: string }[];
      result?: {
        id: string;
        name: string;
        type: string;
        content: string;
        proxied?: boolean;
        ttl: number;
      }[];
    };

    if (!data.success) {
      return NextResponse.json(
        {
          status: "error",
          message: data.errors?.[0]?.message || "Failed to fetch records.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      status: "success",
      records: data.result ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    if (message === "API_TOKEN_MISSING") {
      return NextResponse.json(
        { status: "error", message: "Cloudflare API token not configured." },
        { status: 400 }
      );
    }
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }
}
