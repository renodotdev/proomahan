import PublicLanding from "@/components/public-landing";
import { getVerifiedSession } from "@/lib/neon/auth-server";

import { publicPage } from "@/lib/neon/portal";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [{ data: session }, content] = await Promise.all([getVerifiedSession(), publicPage()]);
  return <PublicLanding signedIn={!!session?.user} content={content} />;
}
