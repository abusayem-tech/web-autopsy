import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { TeamClient } from "./team-client";

export default async function TeamPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  return (
    <AppShell userName={user.name || user.email}>
      <TeamClient />
    </AppShell>
  );
}
