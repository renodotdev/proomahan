import { getVerifiedSession } from "@/lib/neon/auth-server";
import { apiError } from "@/lib/neon/request";
import { residentWorkspace } from "@/lib/neon/resident-workspace";
import { DatabaseAccessError } from "@/lib/neon/tenant-context";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const { data: session } = await getVerifiedSession();
    if (!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.", 401);
    const { tenantId } = await params;
    return Response.json(await residentWorkspace(session.user.id, tenantId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
