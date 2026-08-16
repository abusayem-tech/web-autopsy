import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { SearchClient } from "./search-client";

export default async function SearchPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  return (
    <AppShell userName={user.name || user.email}>
      <SearchClient />
    </AppShell>
  );
}
