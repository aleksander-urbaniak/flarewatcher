import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import {
  DEFAULT_DISCORD_TEMPLATE,
  DEFAULT_SMTP_TEMPLATE,
  normalizeDiscordTemplate,
} from "@/lib/alertTemplates";

type AlertPayload = {
  title: string;
  body: string;
  previousIp?: string | null;
  currentIp?: string | null;
};

const safeTrim = (value?: string | null) => (value ? value.trim() : "");
export async function sendAlerts(userId: string, payload: AlertPayload) {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });

  if (!settings) {
    return;
  }

  const discordWebhookUrl = safeTrim(settings.discordWebhookUrl);
  const discordMarkdown = safeTrim(settings.discordMarkdown);
  const discordEnabled = settings.discordEnabled ?? false;
  const smtpMessage = safeTrim(settings.smtpMessage);
  const smtpTo = safeTrim(settings.smtpTo);
  const smtpEnabled = settings.smtpEnabled ?? false;
  const smtpPass = safeTrim(decryptSecret(settings.smtpPass));

  const discordTemplate = normalizeDiscordTemplate(
    discordMarkdown || DEFAULT_DISCORD_TEMPLATE
  );
  const smtpTemplate = smtpMessage || DEFAULT_SMTP_TEMPLATE;
  const discordMessage = discordTemplate
    .replaceAll("{title}", payload.title)
    .replaceAll("{message}", payload.body)
    .replaceAll("{timestamp}", new Date().toLocaleString())
    .replaceAll("{previousIp}", payload.previousIp || "N/A")
    .replaceAll("{currentIp}", payload.currentIp || "N/A");
  const smtpBody = smtpTemplate
    .replaceAll("{title}", payload.title)
    .replaceAll("{message}", payload.body)
    .replaceAll("{timestamp}", new Date().toLocaleString())
    .replaceAll("{previousIp}", payload.previousIp || "N/A")
    .replaceAll("{currentIp}", payload.currentIp || "N/A");

  if (
    smtpEnabled &&
    smtpTo &&
    settings.smtpHost &&
    settings.smtpPort &&
    settings.smtpUser &&
    smtpPass &&
    settings.smtpFrom
  ) {
    try {
      const { default: nodemailer } = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort,
        secure: settings.smtpPort === 465,
        auth: {
          user: settings.smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: settings.smtpFrom,
        to: smtpTo,
        subject: payload.title,
        text: smtpBody,
      });
    } catch {}
  }

  if (discordEnabled && discordWebhookUrl) {
    try {
      await fetch(discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: discordMessage }),
      });
    } catch {}
  }
}

export type AlertTestType = "discord" | "smtp";

type AlertOverrides = {
  discordWebhookUrl?: string | null;
  discordMarkdown?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPass?: string | null;
  smtpFrom?: string | null;
  smtpTo?: string | null;
  smtpMessage?: string | null;
};

export async function sendTestAlert(
  userId: string,
  type: AlertTestType,
  overrides?: AlertOverrides
) {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });

  if (!settings) {
    throw new Error("No settings found.");
  }

  const discordWebhookUrl = safeTrim(
    overrides?.discordWebhookUrl ?? settings.discordWebhookUrl
  );
  const discordMarkdown = safeTrim(
    overrides?.discordMarkdown ?? settings.discordMarkdown
  );
  const smtpMessage = safeTrim(overrides?.smtpMessage ?? settings.smtpMessage);
  const smtpTo = safeTrim(overrides?.smtpTo ?? settings.smtpTo);
  const smtpHost = safeTrim(overrides?.smtpHost ?? settings.smtpHost);
  const smtpUser = safeTrim(overrides?.smtpUser ?? settings.smtpUser);
  const defaultSmtpPass = safeTrim(decryptSecret(settings.smtpPass));
  const smtpPass = safeTrim(overrides?.smtpPass ?? defaultSmtpPass);
  const smtpFrom = safeTrim(overrides?.smtpFrom ?? settings.smtpFrom);
  const smtpPort = overrides?.smtpPort ?? settings.smtpPort;

  const title = "Flarewatcher test alert";
  const body = "This is a test alert from Flarewatcher.";
  const smtpTemplate = smtpMessage || DEFAULT_SMTP_TEMPLATE;

  if (type === "discord") {
    if (!discordWebhookUrl) {
      throw new Error("Discord webhook is missing.");
    }
    const template = normalizeDiscordTemplate(
      discordMarkdown || DEFAULT_DISCORD_TEMPLATE
    );
    const discordMessage = template
      .replaceAll("{title}", title)
      .replaceAll("{message}", body)
      .replaceAll("{timestamp}", new Date().toLocaleString())
      .replaceAll("{previousIp}", "203.0.113.10")
      .replaceAll("{currentIp}", "203.0.113.11");
    const response = await fetch(discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: discordMessage }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord test failed: ${response.status} ${text}`.trim());
    }
    return;
  }

  if (!smtpTo) {
    throw new Error("SMTP to address is missing.");
  }
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
    throw new Error("SMTP configuration is missing.");
  }

  const smtpBody = smtpTemplate
    .replaceAll("{title}", title)
    .replaceAll("{message}", body)
    .replaceAll("{timestamp}", new Date().toLocaleString())
    .replaceAll("{previousIp}", "203.0.113.10")
    .replaceAll("{currentIp}", "203.0.113.11");

  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  await transporter.sendMail({
    from: smtpFrom,
    to: smtpTo,
    subject: title,
    text: smtpBody,
  });
}
