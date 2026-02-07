import { redirect } from "next/navigation";

import UpdatePanel from "@/components/UpdatePanel";
import { getSessionUser } from "@/lib/auth";

export default async function ZonesPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <UpdatePanel view="zones" />;
}
