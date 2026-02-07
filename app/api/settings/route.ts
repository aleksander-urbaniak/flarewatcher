import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/lib/secrets";

export const runtime = "nodejs";

const settingsSchema = z.object({
  intervalMinutes: z.number().int().min(1).max(120),
  monitoredRecords: z
    .array(
      z.object({
        zoneId: z.string().min(1),
        recordId: z.string().min(1),
      })
    )
    .optional(),
  discordWebhookUrl: z.string().url().optional().nullable(),
  discordMarkdown: z.string().optional().nullable(),
  discordEnabled: z.boolean().optional(),
  smtpHost: z.string().min(1).optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpUser: z.string().min(1).optional().nullable(),
  smtpPass: z.string().min(1).optional().nullable(),
  smtpFrom: z.string().min(1).optional().nullable(),
  smtpTo: z.string().email().optional().nullable(),
  smtpMessage: z.string().optional().nullable(),
  smtpEnabled: z.boolean().optional(),
  notifyOnIpChange: z.boolean().optional(),
  notifyOnFailure: z.boolean().optional(),
});

export async function GET() {
  try {
    const user = await requireSessionUser();
    const settings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });
    const decodedSmtpPass = decryptSecret(settings?.smtpPass);

    if (
      settings?.smtpPass &&
      decodedSmtpPass &&
      !isEncryptedSecret(settings.smtpPass)
    ) {
      const encrypted = encryptSecret(decodedSmtpPass);
      if (encrypted && encrypted !== settings.smtpPass) {
        await prisma.userSettings.update({
          where: { userId: user.id },
          data: { smtpPass: encrypted },
        });
      }
    }

    return NextResponse.json({
      status: "success",
      settings: settings
        ? {
            intervalMinutes: settings.intervalMinutes,
            monitoredRecords: settings.monitoredRecords,
            discordWebhookUrl: settings.discordWebhookUrl,
            discordMarkdown: settings.discordMarkdown,
            discordEnabled: settings.discordEnabled,
            smtpHost: settings.smtpHost,
            smtpPort: settings.smtpPort,
            smtpUser: settings.smtpUser,
            smtpPass: decodedSmtpPass,
            smtpFrom: settings.smtpFrom,
            smtpTo: settings.smtpTo,
            smtpMessage: settings.smtpMessage,
            smtpEnabled: settings.smtpEnabled,
            notifyOnIpChange: settings.notifyOnIpChange,
            notifyOnFailure: settings.notifyOnFailure,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { status: "error", message: status === 401 ? message : "Request failed." },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const parsed = settingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid settings." },
        { status: 400 }
      );
    }

    const {
      intervalMinutes,
      monitoredRecords,
      discordWebhookUrl,
      discordMarkdown,
      discordEnabled,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFrom,
      smtpTo,
      smtpMessage,
      smtpEnabled,
      notifyOnIpChange,
      notifyOnFailure,
    } = parsed.data;
    const encodedSmtpPass =
      smtpPass !== undefined ? encryptSecret(smtpPass ?? null) : undefined;

    const saved = await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        intervalMinutes,
        monitoredRecords: monitoredRecords ?? [],
        discordWebhookUrl: discordWebhookUrl ?? null,
        discordMarkdown: discordMarkdown ?? null,
        discordEnabled: discordEnabled ?? true,
        smtpHost: smtpHost ?? null,
        smtpPort: smtpPort ?? null,
        smtpUser: smtpUser ?? null,
        smtpPass: encodedSmtpPass ?? null,
        smtpFrom: smtpFrom ?? null,
        smtpTo: smtpTo ?? null,
        smtpMessage: smtpMessage ?? null,
        smtpEnabled: smtpEnabled ?? true,
        notifyOnIpChange: notifyOnIpChange ?? true,
        notifyOnFailure: notifyOnFailure ?? true,
      },
      update: {
        intervalMinutes,
        ...(monitoredRecords ? { monitoredRecords } : null),
        ...(discordWebhookUrl !== undefined
          ? { discordWebhookUrl: discordWebhookUrl ?? null }
          : null),
        ...(discordMarkdown !== undefined
          ? { discordMarkdown: discordMarkdown ?? null }
          : null),
        ...(discordEnabled !== undefined ? { discordEnabled } : null),
        ...(smtpHost !== undefined ? { smtpHost: smtpHost ?? null } : null),
        ...(smtpPort !== undefined ? { smtpPort: smtpPort ?? null } : null),
        ...(smtpUser !== undefined ? { smtpUser: smtpUser ?? null } : null),
        ...(smtpPass !== undefined ? { smtpPass: encodedSmtpPass ?? null } : null),
        ...(smtpFrom !== undefined ? { smtpFrom: smtpFrom ?? null } : null),
        ...(smtpTo !== undefined ? { smtpTo: smtpTo ?? null } : null),
        ...(smtpMessage !== undefined ? { smtpMessage: smtpMessage ?? null } : null),
        ...(smtpEnabled !== undefined ? { smtpEnabled } : null),
        ...(notifyOnIpChange !== undefined
          ? { notifyOnIpChange }
          : null),
        ...(notifyOnFailure !== undefined ? { notifyOnFailure } : null),
      },
    });

    await logAuditEvent({
      userId: user.id,
      action: "settings.update",
      targetType: "settings",
      detail: {
        fields: Object.keys(parsed.data),
        monitoredCount: monitoredRecords?.length ?? undefined,
      },
    });

    return NextResponse.json({
      status: "success",
      settings: {
        intervalMinutes: saved.intervalMinutes,
        monitoredRecords: saved.monitoredRecords,
        discordWebhookUrl: saved.discordWebhookUrl,
        discordMarkdown: saved.discordMarkdown,
        discordEnabled: saved.discordEnabled,
        smtpHost: saved.smtpHost,
        smtpPort: saved.smtpPort,
        smtpUser: saved.smtpUser,
        smtpPass: decryptSecret(saved.smtpPass),
        smtpFrom: saved.smtpFrom,
        smtpTo: saved.smtpTo,
        smtpMessage: saved.smtpMessage,
        smtpEnabled: saved.smtpEnabled,
        notifyOnIpChange: saved.notifyOnIpChange,
        notifyOnFailure: saved.notifyOnFailure,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { status: "error", message: status === 401 ? message : "Request failed." },
      { status }
    );
  }
}
