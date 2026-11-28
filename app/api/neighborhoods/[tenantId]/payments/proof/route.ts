import { createHash, randomUUID } from "node:crypto";
import { getVerifiedSession } from "@/lib/neon/auth-server";
import { billingStaff } from "@/lib/neon/bill-schedules";
import { documentExtension, MAX_DOCUMENT_SIZE, readDocumentName } from "@/lib/neon/document-key";
import { residentInvoice } from "@/lib/neon/payments";
import { apiError, assertSameOrigin } from "@/lib/neon/request";
import { getStorage } from "@/lib/neon/storage";
import { DatabaseAccessError, validUuid, withActorTenant } from "@/lib/neon/tenant-context";

export const runtime = "nodejs";
type Context = { params: Promise<{ tenantId: string }> };
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const { data: session } = await getVerifiedSession();
    if (!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.", 401);
    const actor = session.user.id;
    const { tenantId } = await params;
    const invoice = new URL(request.url).searchParams.get("invoice") || "";
    await withActorTenant(actor, tenantId, async db => {
      if ((await residentInvoice(db, tenantId, actor, invoice, true)).status !== "issued") {
        throw new DatabaseAccessError("Tagihan ini tidak dapat dibayar.", 409);
      }
    });
    const reader = request.body?.getReader();
    if (!reader) throw new DatabaseAccessError("Pilih bukti pembayaran.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_DOCUMENT_SIZE) {
        await reader.cancel();
        throw new DatabaseAccessError("Ukuran bukti maksimal 3 MB.", 413);
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const extension = documentExtension(bytes);
    if (!extension) throw new DatabaseAccessError("Gunakan PDF atau gambar JPG/PNG.", 400);
    const contentType = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" }[extension];
    const key = `payment-proofs/${tenantId}/${randomUUID()}.${extension}`;
    const name = readDocumentName(request.headers.get("x-document-name")) || `bukti.${extension}`;
    const storage = getStorage();
    await storage.upload(key, bytes, { contentType });
    try {
      const file = await withActorTenant(actor, tenantId, async db => {
        const { rows: [row] } = await db.query<{ id: string }>(`INSERT INTO app.files
          (tenant_id,storage_key,original_name,mime_type,byte_size,purpose,uploaded_by,checksum)
          VALUES ($1,$2,$3,$4,$5,'payment_proof',$6,$7) RETURNING id`, [tenantId, key, name, contentType, size, actor, checksum]);
        return row;
      });
      return Response.json(file, { status: 201, headers });
    } catch (error) {
      await storage.delete(key).catch(() => undefined);
      throw error;
    }
  } catch (error) { return apiError(error); }
}

export async function GET(request: Request, { params }: Context) {
  try {
    const { data: session } = await getVerifiedSession();
    if (!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.", 401);
    const { tenantId } = await params;
    const payment = new URL(request.url).searchParams.get("payment") || "";
    if (!validUuid(payment)) throw new DatabaseAccessError("Bukti tidak ditemukan.", 404);
    const file = await withActorTenant(session.user.id, tenantId, async db => {
      const { rows: [row] } = await db.query<{ storage_key: string; mime_type: string }>(`
        SELECT f.storage_key,f.mime_type FROM app.payments p JOIN app.files f ON (f.tenant_id,f.id)=(p.tenant_id,p.proof_file_id)
        WHERE p.tenant_id=$1 AND p.id=$2 AND f.purpose='payment_proof' AND f.deleted_at IS NULL AND f.scan_status<>'rejected'`,
      [tenantId, payment]);
      if (!row) throw new DatabaseAccessError("Bukti tidak ditemukan.", 404);
      return row;
    }, billingStaff);
    const object = await getStorage().download(file.storage_key);
    const extension = file.storage_key.split(".").pop();
    return new Response(await object.arrayBuffer(), { headers: {
      ...headers, "Content-Type": file.mime_type, "Content-Disposition": `attachment; filename="bukti-pembayaran.${extension}"`,
    } });
  } catch (error) { return apiError(error); }
}
