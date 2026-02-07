const TABLE_HEADER_LINE = "| Attribute | Details |";
const TABLE_DIVIDER_LINE = "| --- | --- |";

const TABLE_HEADER_REGEX =
  /^\s*\|\s*(?:\*\*)?\s*Attribute\s*(?:\*\*)?\s*\|\s*(?:\*\*)?\s*Details\s*(?:\*\*)?\s*\|\s*$/i;
const TABLE_DIVIDER_REGEX = /^\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*$/i;

export const DEFAULT_DISCORD_TEMPLATE =
  "\u{1F310} **Network Alert: IP Address Change Detected**\n\n" +
  "**Status Update**\n" +
  "The monitoring system has detected a change in your external network configuration. " +
  "Your connection has been updated successfully.\n\n" +
  `${TABLE_HEADER_LINE}\n` +
  `${TABLE_DIVIDER_LINE}\n` +
  "| Status | \u{1F7E2} Active / Updated |\n" +
  "| Previous IP | {previousIp} |\n" +
  "| Current IP | {currentIp} |\n" +
  "| Detection Time | {timestamp} |";

export const DEFAULT_SMTP_TEMPLATE =
  "{title}\n\n{message}\n\nPrevious IP: {previousIp}\nCurrent IP: {currentIp}\nTimestamp: {timestamp}";

export const normalizeDiscordTemplate = (template: string) => {
  const lines = template.replace(/\r\n/g, "\n").split("\n");
  const headerIndex = lines.findIndex((line) => TABLE_HEADER_REGEX.test(line));

  if (headerIndex === -1) {
    return template;
  }

  const withoutFence = lines.filter((line) => {
    return !/^\s*```(?:text|markdown)?\s*$/i.test(line) && !/^\s*```\s*$/.test(line);
  });

  const nextHeaderIndex = withoutFence.findIndex((line) => TABLE_HEADER_REGEX.test(line));
  if (nextHeaderIndex === -1) {
    return withoutFence.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  withoutFence[nextHeaderIndex] = TABLE_HEADER_LINE;
  const nextLine = withoutFence[nextHeaderIndex + 1] ?? "";
  if (!TABLE_DIVIDER_REGEX.test(nextLine)) {
    withoutFence.splice(nextHeaderIndex + 1, 0, TABLE_DIVIDER_LINE);
  }

  return withoutFence.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};
