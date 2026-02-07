import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth";
import { getPublicIp } from "@/lib/ip";
import { getUserTokenById } from "@/lib/tokens";
import { logAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";

const payloadSchema = z.object({
  zoneId: z.string().min(1),
  recordId: z.string().min(1),
  tokenId: z.string().min(1),
  ttl: z.number().int().min(1).max(86400),
  proxied: z.boolean(),
  comment: z.string().max(500).optional().nullable(),
  trigger: z.enum(["manual", "auto"]).optional(),
});

export async function POST(request: Request) {
  let logId: string | null = null;
  try {
    const user = await requireSessionUser();

    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          status: "error",
          message: "Invalid request payload.",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { zoneId, recordId, ttl, proxied, comment, tokenId } = parsed.data;
    const token = await getUserTokenById(user.id, tokenId);

    const recordResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    const recordData = (await recordResponse.json()) as {
      success?: boolean;
      errors?: { message: string }[];
      result?: {
        name: string;
        type: string;
        content: string;
        ttl: number;
        proxied: boolean;
      };
    };

    if (!recordData.success || !recordData.result) {
      return NextResponse.json(
        {
          status: "error",
          message:
            recordData.errors?.[0]?.message || "Unable to load record details.",
        },
        { status: 400 }
      );
    }

    const ipAddress = await getPublicIp();
    const { name, type, content, ttl: currentTtl, proxied: currentProxied } =
      recordData.result;

    const payload: Record<string, unknown> = {
      name,
      type: type.toUpperCase(),
      content: ipAddress,
      ttl,
      proxied,
    };

    if (comment && comment.trim().length > 0) {
      payload.comment = comment.trim();
    }

    const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const cfData = (await response.json()) as {
      success?: boolean;
      errors?: { message: string }[];
    };

    const status = cfData.success ? "success" : "error";
    const message = cfData.success
      ? "DNS record updated."
      : cfData.errors?.[0]?.message || "Cloudflare rejected the update.";

    let propagated: boolean | null = null;
    let propagationNote: string | null = null;

    if (type.toUpperCase() === "A") {
      try {
        const dnsResponse = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
            name
          )}&type=A`,
          {
            headers: { Accept: "application/dns-json" },
            cache: "no-store",
          }
        );
        const dnsData = (await dnsResponse.json()) as {
          Answer?: { data?: string }[];
        };
        const answers = (dnsData.Answer ?? [])
          .map((entry) => entry.data)
          .filter((entry): entry is string => Boolean(entry));
        propagated = answers.includes(ipAddress);
        propagationNote = propagated
          ? "DNS record matches public IP."
          : "DNS record has not propagated yet.";
      } catch (error) {
        propagationNote = "Propagation check failed.";
      }
    } else {
      propagationNote = "Propagation check skipped for non-A record.";
    }

    const record = await prisma.dnsUpdate.create({
      data: {
        zoneId,
        tokenId,
        recordId,
        name,
        type: type.toUpperCase(),
        previousContent: content ?? null,
        previousTtl: typeof currentTtl === "number" ? currentTtl : null,
        previousProxied: typeof currentProxied === "boolean" ? currentProxied : null,
        content: ipAddress,
        ttl,
        proxied,
        comment: comment?.trim() || null,
        status,
        trigger: parsed.data.trigger ?? "manual",
        actor: user.email,
        propagated,
        propagationNote,
        response: JSON.stringify(cfData),
      },
    });

    logId = record.id;
    await logAuditEvent({
      userId: user.id,
      action: "dns.update",
      targetType: "record",
      targetId: recordId,
      detail: {
        zoneId,
        name,
        type,
        status,
        trigger: parsed.data.trigger ?? "manual",
      },
    });

    return NextResponse.json(
      {
        status,
        message,
        cf: cfData,
        logId,
        propagation: {
          ok: propagated,
          note: propagationNote,
        },
      },
      { status: cfData.success ? 200 : 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    if (message === "API_TOKEN_MISSING") {
      return NextResponse.json(
        { status: "error", message: "Cloudflare API token not configured." },
        { status: 400 }
      );
    }
    if (message === "UNAUTHORIZED") {
      return NextResponse.json(
        { status: "error", message: "Unauthorized" },
        { status: 401 }
      );
    }
    if (logId) {
      try {
        await prisma.dnsUpdate.update({
          where: { id: logId },
          data: {
            status: "error",
            response: JSON.stringify({ error: message }),
          },
        });
      } catch {}
    }
    return NextResponse.json(
      { status: "error", message },
      { status: 500 }
    );
  }
}
