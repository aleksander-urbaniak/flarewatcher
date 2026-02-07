import { redirect } from "next/navigation";

import LoginForm from "@/components/LoginForm";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/");
  }

  const userCount = await prisma.user.count();
  if (userCount === 0) {
    redirect("/setup");
  }

  return <LoginForm />;
}
