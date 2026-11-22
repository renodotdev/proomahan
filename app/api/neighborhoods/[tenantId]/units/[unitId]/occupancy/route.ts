import { getVerifiedSession } from "@/lib/neon/auth-server";
import { changeOccupancy, getOccupancyDetails } from "@/lib/neon/core-records";
import { DatabaseAccessError } from "@/lib/neon/tenant-context";
import { assertSameOrigin,jsonBody,apiError } from "@/lib/neon/request";
export async function GET(_request: Request, { params }: { params: Promise<{ tenantId: string; unitId: string }> }) {
 try {
  const { data: session } = await getVerifiedSession();
  if (!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.", 401);
  const { tenantId, unitId } = await params;
  return Response.json(await getOccupancyDetails(session.user.id, tenantId, unitId), { headers: { "Cache-Control": "private, no-store" } });
 } catch (error) { return apiError(error); }
}
export async function POST(request:Request,{params}:{params:Promise<{tenantId:string;unitId:string}>}) {
 try{
  assertSameOrigin(request);
  const {data:session}=await getVerifiedSession();
  if(!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.",401);
  const {tenantId,unitId}=await params;
  return Response.json(await changeOccupancy(session.user.id,tenantId,unitId,await jsonBody(request)),{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  if(error && typeof error==="object" && "code" in error && ["P0001","23514","23503"].includes(String(error.code))) return apiError(new DatabaseAccessError("Periksa tanggal dan riwayat hunian. Periode tidak boleh bertumpang tindih; tanggal keluar harus setelah tanggal masuk.",400));
  return apiError(error);
 }
}
