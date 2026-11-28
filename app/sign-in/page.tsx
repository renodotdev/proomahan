import { redirect } from "next/navigation";
import NeonSignIn from "@/components/neon-sign-in";
import { getVerifiedSession } from "@/lib/neon/auth-server";
import { publicCommunityContact } from "@/lib/neon/community-contact";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const { data: session } = await getVerifiedSession();
  if (session?.user) redirect("/workspace");
  return <NeonSignIn contact={await publicCommunityContact()} />;
}
