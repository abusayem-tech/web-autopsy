import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getSessionUser();
  const params = await searchParams;
  if (user) {
    const next = params.next;
    if (next && next.startsWith("/") && !next.startsWith("//")) redirect(next);
    redirect("/captures");
  }

  return <LoginForm nextPath={params.next && params.next.startsWith("/") ? params.next : "/captures"} />;
}
