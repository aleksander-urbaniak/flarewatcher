import { redirect } from "next/navigation";

import DashboardHome from "@/components/DashboardHome";
import { getSessionUser } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <DashboardHome />;
}
