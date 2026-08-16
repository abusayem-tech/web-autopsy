import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";
import { CaptureDetailClient } from "./detail-client";

export default async function CaptureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const { id } = await params;
  return (
    <AppShell userName={user.name || user.email}>
      <CommandPalette />
      <CaptureDetailClient id={id} />
    </AppShell>
  );
}
