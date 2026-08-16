import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { OriginClient } from "./origin-client";

export default async function OriginPage({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const { host } = await params;
  const origin = decodeURIComponent(host);
  return (
    <AppShell userName={user.name || user.email}>
      <OriginClient origin={origin} />
    </AppShell>
  );
}
