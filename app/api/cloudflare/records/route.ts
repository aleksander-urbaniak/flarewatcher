import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { fetchCloudflarePaginated, getUserTokenById } from "@/lib/tokens";
import { isValidCloudflareId } from "@/lib/cloudflareIds";

export const runtime = "nodejs";

type CloudflareRecord = {
  id: string;
  name: string;
  type: string;
  content: string;
  proxied?: boolean;
  ttl: number;
};

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
    if (!isValidCloudflareId(zoneId) || !isValidCloudflareId(tokenId)) {
      return NextResponse.json(
        { status: "error", message: "Invalid zoneId or tokenId." },
        { status: 400 }
      );
    }

    const token = await getUserTokenById(user.id, tokenId);

    const page = await fetchCloudflarePaginated<CloudflareRecord>(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      token,
      100
    );

    if (!page.success) {
      return NextResponse.json(
        { status: "error", message: page.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      status: "success",
      records: page.result,
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
