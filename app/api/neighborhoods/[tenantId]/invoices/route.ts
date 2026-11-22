import { getVerifiedSession } from "@/lib/neon/auth-server";
import { createBillSchedule } from "@/lib/neon/bill-schedules";
import { changeInvoice, listInvoices } from "@/lib/neon/invoices";
import { apiError, assertSameOrigin, jsonBody } from "@/lib/neon/request";
import { DatabaseAccessError } from "@/lib/neon/tenant-context";

type Context = { params: Promise<{ tenantId: string }> };
const headers = { "Cache-Control": "private, no-store" };

function invoiceError(error: unknown) {
  const failure = error as { code?: string; message?: string } | null;
  if (failure?.code === "42703" && /water_tariff_id|fee_schedule_id/.test(failure.message ?? "")) {
    return apiError(new DatabaseAccessError("Fitur jadwal tagihan memerlukan pembaruan basis data. Hubungi pengelola aplikasi.", 503));
  }
  return apiError(error);
}

export async function GET(request: Request, { params }: Context) {
  try {
    const { data: session } = await getVerifiedSession();
    if (!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.", 401);
    const { tenantId } = await params;
    return Response.json(await listInvoices(session.user.id, tenantId, new URL(request.url).searchParams), { headers });
  } catch (error) { return invoiceError(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const { data: session } = await getVerifiedSession();
    if (!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.", 401);
    const { tenantId } = await params;
    const body = await jsonBody(request);
    const change = body.action === "create-schedule" ? createBillSchedule : changeInvoice;
    return Response.json(await change(session.user.id, tenantId, body), { headers });
  } catch (error) {
    const failure = error as { code?: string; constraint?: string; message?: string };
    if (failure?.code === "23505" && failure.constraint === "one_invoice_per_period") {
      return apiError(new DatabaseAccessError("Tagihan iuran untuk unit, penanggung, dan periode ini sudah ada.", 409));
    }
    if (failure?.code === "23505" && failure.constraint === "one_scheduled_invoice_per_period") {
      return apiError(new DatabaseAccessError("Tagihan untuk jadwal, unit, dan periode ini sudah pernah terbit.", 409));
    }
    if (failure?.code === "23505" && failure.constraint === "meter_readings_tenant_id_meter_id_period_key") {
      return apiError(new DatabaseAccessError("Pembacaan meter untuk periode ini sudah dicatat.", 409));
    }
    if (failure?.code === "23505" && failure.constraint === "fee_items_tenant_id_code_key") {
      return apiError(new DatabaseAccessError("Nama jadwal tagihan sudah digunakan.", 409));
    }
    if (failure?.code === "P0001" && failure.message === "Reverse verified payments before voiding an invoice") {
      return apiError(new DatabaseAccessError("Tagihan dengan pembayaran terverifikasi tidak dapat dibatalkan.", 409));
    }
    return invoiceError(error);
  }
}
