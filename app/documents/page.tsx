import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/neon/auth-server";
import NeonDocuments from "@/components/neon-documents";
export const dynamic = "force-dynamic";
export default async function DocumentsPage() {
  const { data: session } = await getVerifiedSession();
  if (!session?.user) redirect("/sign-in");
  return <NeonDocuments />;
}
