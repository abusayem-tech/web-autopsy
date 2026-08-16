import { redirect } from "next/navigation";
import { getSessionUser, getUserWorkspace } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";
import { CapturesClient } from "./captures-client";

export default async function CapturesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const ws = await getUserWorkspace(user.id);
  if (!ws) redirect("/");

  return (
    <AppShell userName={user.name || user.email}>
      <CommandPalette />
      <CapturesClient />
    </AppShell>
  );
}
