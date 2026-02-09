import { redirect } from "next/navigation";

import LogsPanel from "@/components/LogsPanel";
import { getSessionUser } from "@/lib/auth";

export default async function LogsPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <LogsPanel />;
}
