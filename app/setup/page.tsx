import { redirect } from "next/navigation";

import SetupForm from "@/components/SetupForm";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SetupPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/");
  }

  const userCount = await prisma.user.count();
  if (userCount > 0) {
    redirect("/login");
  }

  return <SetupForm />;
}
