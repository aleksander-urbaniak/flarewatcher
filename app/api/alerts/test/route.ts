import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSessionUser } from "@/lib/auth";
import { sendTestAlert } from "@/lib/alerts";

export const runtime = "nodejs";

const schema = z.object({
  type: z.enum(["discord", "smtp"]),
  discordWebhookUrl: z.string().url().optional().nullable(),
  discordMarkdown: z.string().optional().nullable(),
  smtpHost: z.string().min(1).optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpUser: z.string().min(1).optional().nullable(),
  smtpPass: z.string().min(1).optional().nullable(),
  smtpFrom: z.string().min(1).optional().nullable(),
  smtpTo: z.string().email().optional().nullable(),
  smtpMessage: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid test payload." },
        { status: 400 }
      );
    }

    await sendTestAlert(user.id, parsed.data.type, {
      discordWebhookUrl: parsed.data.discordWebhookUrl ?? null,
      discordMarkdown: parsed.data.discordMarkdown ?? null,
      smtpHost: parsed.data.smtpHost ?? null,
      smtpPort: parsed.data.smtpPort ?? null,
      smtpUser: parsed.data.smtpUser ?? null,
      smtpPass: parsed.data.smtpPass ?? null,
      smtpFrom: parsed.data.smtpFrom ?? null,
      smtpTo: parsed.data.smtpTo ?? null,
      smtpMessage: parsed.data.smtpMessage ?? null,
    });
    return NextResponse.json({ status: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }
}
