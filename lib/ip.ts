export async function getPublicIp() {
  const response = await fetch("https://api.ipify.org?format=json", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to detect public IP.");
  }

  const data = (await response.json()) as { ip?: string };
  if (!data.ip) {
    throw new Error("Unable to detect public IP.");
  }

  return data.ip;
}
