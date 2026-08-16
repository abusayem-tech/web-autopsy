import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { ExtensionClient } from "./extension-client";

export default async function ExtensionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/?next=/extension");

  return (
    <AppShell userName={user.name || user.email}>
      <ExtensionClient />
    </AppShell>
  );
}
