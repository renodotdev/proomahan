import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/neon/auth-server";
import DashboardShell from "@/components/dashboard-shell";

export const dynamic = "force-dynamic";
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = await getVerifiedSession();
  if (!session?.user) redirect("/sign-in");
  return <DashboardShell key={session.user.id} userId={session.user.id}>{children}</DashboardShell>;
}
