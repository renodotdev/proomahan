import { getNeighborhood } from "@/lib/neon/neighborhood";
import { DatabaseAccessError } from "@/lib/neon/tenant-context";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, {params}: {params:Promise<{tenantId:string}>}) {
  try {
    const {tenantId} = await params;
    return Response.json(await getNeighborhood(tenantId),{headers:{"Cache-Control":"private, no-store"}});
  } catch (error) {
    const status = error instanceof DatabaseAccessError ? error.status : 503;
    return Response.json({error: status===401 ? "Silakan masuk terlebih dahulu." : status===403 ? "Akses lingkungan belum tersedia untuk akun ini." : "Data lingkungan belum dapat dimuat."},{status,headers:{"Cache-Control":"private, no-store"}});
  }
}
