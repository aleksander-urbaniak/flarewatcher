export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDdnsScheduler } = await import("@/lib/ddns");
    startDdnsScheduler();
  }
}
