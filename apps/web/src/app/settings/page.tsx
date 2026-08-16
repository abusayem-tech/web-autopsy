import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  return (
    <AppShell userName={user.name || user.email}>
      <SettingsClient />
    </AppShell>
  );
}
