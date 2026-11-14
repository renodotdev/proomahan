import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/neon/auth-server";
import PublicLanding from "@/components/public-landing";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { data: session } = await getVerifiedSession();
  if (session?.user) redirect("/workspace");
  return <PublicLanding />;
}
