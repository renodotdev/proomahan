import PublicLanding from "@/components/public-landing";
import { getVerifiedSession } from "@/lib/neon/auth-server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { data: session } = await getVerifiedSession();
  return <PublicLanding signedIn={!!session?.user} />;
}
