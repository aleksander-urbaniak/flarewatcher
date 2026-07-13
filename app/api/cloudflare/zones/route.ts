import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { fetchCloudflarePaginated, getAllUserTokens } from "@/lib/tokens";

export const runtime = "nodejs";

type CloudflareZone = { id: string; name: string; status: string };

export async function GET() {
  try {
    const user = await requireSessionUser();
    const tokens = await getAllUserTokens(user.id);

    const results = await Promise.allSettled(
      tokens.map(async (token) => {
        const page = await fetchCloudflarePaginated<CloudflareZone>(
          "https://api.cloudflare.com/client/v4/zones",
          token.token,
          50
        );

        if (!page.success) {
          throw new Error(page.message);
        }

        return page.result.map((zone) => ({
          ...zone,
          tokenId: token.id,
          tokenName: token.name,
        }));
      })
    );

    const zones = results
      .filter((result) => result.status === "fulfilled")
      .flatMap((result) => (result as PromiseFulfilledResult<any>).value);

    const failures = results.filter((result) => result.status === "rejected");
    if (zones.length === 0 && failures.length > 0) {
      return NextResponse.json(
        { status: "error", message: "Failed to fetch zones for all tokens." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      status: "success",
      zones,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    if (message === "API_TOKEN_MISSING") {
      return NextResponse.json(
        { status: "error", message: "No Cloudflare tokens configured." },
        { status: 400 }
      );
    }
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }
}
