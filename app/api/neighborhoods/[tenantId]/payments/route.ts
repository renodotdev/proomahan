import { getVerifiedSession } from "@/lib/neon/auth-server";
import { addPaymentAccount, markBillRead, paymentDetails, reviewPayment, staffPayments, submitPayment } from "@/lib/neon/payments";
import { apiError, assertSameOrigin, jsonBody } from "@/lib/neon/request";
import { DatabaseAccessError } from "@/lib/neon/tenant-context";

type Context = { params: Promise<{ tenantId: string }> };
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: Context) {
  try {
    const { data: session } = await getVerifiedSession();
    if (!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.", 401);
    const { tenantId } = await params;
    const query = new URL(request.url).searchParams;
    const invoice = query.get("invoice");
    const page = Math.max(1, Math.min(100000, Math.floor(Number(query.get("page"))) || 1));
    const result = invoice ? await paymentDetails(session.user.id, tenantId, invoice) : await staffPayments(session.user.id, tenantId, page);
    return Response.json(result, { headers });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const { data: session } = await getVerifiedSession();
    if (!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.", 401);
    const { tenantId } = await params;
    const body = await jsonBody(request);
    const actor = session.user.id;
    let result;
    switch (body.action) {
      case "read": result = await markBillRead(actor, tenantId, String(body.invoice)); break;
      case "submit": result = await submitPayment(actor, tenantId, body); break;
      case "verify":
      case "reject": result = await reviewPayment(actor, tenantId, body); break;
      case "account": result = await addPaymentAccount(actor, tenantId, body); break;
      default: throw new DatabaseAccessError("Tindakan pembayaran tidak valid.", 400);
    }
    return Response.json(result, { headers });
  } catch (error) { return apiError(error); }
}
