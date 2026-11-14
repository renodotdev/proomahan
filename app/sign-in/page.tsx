import { redirect } from "next/navigation";
import NeonSignIn from "@/components/neon-sign-in";
import { getVerifiedSession } from "@/lib/neon/auth-server";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const { data: session } = await getVerifiedSession();
  if (session?.user) redirect("/workspace");
  return <NeonSignIn />;
}
