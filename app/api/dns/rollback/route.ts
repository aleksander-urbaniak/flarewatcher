import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth";
import { getUserTokenById } from "@/lib/tokens";
import { logAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";

const payloadSchema = z.object({
  updateId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid payload." },
        { status: 400 }
      );
    }

    const update = await prisma.dnsUpdate.findUnique({
      where: { id: parsed.data.updateId },
    });

    if (!update?.tokenId || !update.previousContent) {
      return NextResponse.json(
        { status: "error", message: "Rollback not available for this update." },
        { status: 400 }
      );
    }

    const ownedByUser =
      typeof update.actor === "string" &&
      update.actor.trim().toLowerCase() === user.email.trim().toLowerCase();
    if (!user.isAdmin && !ownedByUser) {
      return NextResponse.json(
        { status: "error", message: "Update not found." },
        { status: 404 }
      );
    }

    const token = await getUserTokenById(user.id, update.tokenId);

    const recordResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${update.zoneId}/dns_records/${update.recordId}`,
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

    const current = recordData.result;

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${update.zoneId}/dns_records/${update.recordId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: current.name,
          type: current.type,
          content: update.previousContent,
          ttl: update.previousTtl ?? current.ttl,
          proxied: update.previousProxied ?? current.proxied,
          comment: "Flarewatcher rollback",
        }),
        cache: "no-store",
      }
    );

    const cfData = (await response.json()) as {
      success?: boolean;
      errors?: { message: string }[];
    };

    const status = cfData.success ? "success" : "error";
    const message = cfData.success
      ? "DNS record rolled back."
      : cfData.errors?.[0]?.message || "Cloudflare rejected the rollback.";

    await prisma.dnsUpdate.create({
      data: {
        zoneId: update.zoneId,
        tokenId: update.tokenId,
        recordId: update.recordId,
        name: current.name,
        type: current.type.toUpperCase(),
        previousContent: current.content,
        previousTtl: current.ttl,
        previousProxied: current.proxied,
        content: update.previousContent,
        ttl: update.previousTtl ?? current.ttl,
        proxied: update.previousProxied ?? current.proxied,
        comment: "Rollback",
        status,
        trigger: "rollback",
        actor: user.email,
        propagated: null,
        propagationNote: null,
        response: JSON.stringify(cfData),
      },
    });

    await logAuditEvent({
      userId: user.id,
      action: "dns.rollback",
      targetType: "record",
      targetId: update.recordId,
      detail: {
        zoneId: update.zoneId,
        name: current.name,
        status,
      },
    });

    return NextResponse.json(
      { status, message, cf: cfData },
      { status: cfData.success ? 200 : 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { status: "error", message: status === 401 ? message : "Request failed." },
      { status }
    );
  }
}
