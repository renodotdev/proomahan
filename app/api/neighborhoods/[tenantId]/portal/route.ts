import { getVerifiedSession } from "@/lib/neon/auth-server";
import { bulletin, housingList, overview, portalPage, publicPageDraft, saveAnnouncement, savePublicPage } from "@/lib/neon/portal";
import { apiError, assertSameOrigin, jsonBody } from "@/lib/neon/request";
import { DatabaseAccessError } from "@/lib/neon/tenant-context";

type Context = { params: Promise<{ tenantId: string }> };
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: Context) {
  try {
    const { data: session } = await getVerifiedSession();
    if (!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.",401);
    const { tenantId } = await params;
    const actor = session.user.id;
    const query = new URL(request.url).searchParams;
    let result;
    switch (query.get("view")) {
      case "summary": result = await overview(actor, tenantId, query.get("period")); break;
      case "rentals": result = await housingList(actor, tenantId, query); break;
      case "bulletin": result = await bulletin(actor, tenantId, portalPage(query)); break;
      case "public-page": result = await publicPageDraft(actor, tenantId); break;
      default: throw new DatabaseAccessError("Halaman tidak ditemukan.",404);
    }
    return Response.json(result, { headers });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const { data: session } = await getVerifiedSession();
    if (!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.",401);
    const { tenantId } = await params;
    const body = await jsonBody(request);
    const view = new URL(request.url).searchParams.get("view");
    if (view !== "bulletin" && view !== "public-page") throw new DatabaseAccessError("Halaman tidak ditemukan.",404);
    const result = await (view === "bulletin" ? saveAnnouncement : savePublicPage)(session.user.id,tenantId,body);
    return Response.json(result, { headers });
  } catch (error) { return apiError(error); }
}
