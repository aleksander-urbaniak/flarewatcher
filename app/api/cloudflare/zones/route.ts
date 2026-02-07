import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth";
import { getAllUserTokens } from "@/lib/tokens";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const tokens = await getAllUserTokens(user.id);

    const results = await Promise.allSettled(
      tokens.map(async (token) => {
        const response = await fetch(
          "https://api.cloudflare.com/client/v4/zones?per_page=50",
          {
            headers: {
              Authorization: `Bearer ${token.token}`,
            },
            cache: "no-store",
          }
        );

        const data = (await response.json()) as {
          success?: boolean;
          errors?: { message: string }[];
          result?: { id: string; name: string; status: string }[];
        };

        if (!data.success) {
          throw new Error(
            data.errors?.[0]?.message || "Failed to fetch zones."
          );
        }

        return (data.result ?? []).map((zone) => ({
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
