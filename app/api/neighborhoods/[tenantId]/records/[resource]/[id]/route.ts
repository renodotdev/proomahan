import { getVerifiedSession } from "@/lib/neon/auth-server";
import { saveRecord } from "@/lib/neon/core-records";
import { coreResource } from "@/lib/neon/core-input";
import { DatabaseAccessError } from "@/lib/neon/tenant-context";
import { assertSameOrigin,jsonBody,apiError } from "@/lib/neon/request";
export async function PATCH(request:Request,{params}:{params:Promise<{tenantId:string;resource:string;id:string}>}) {
 try{
  assertSameOrigin(request);
  const {data:session}=await getVerifiedSession();
  if(!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.",401);
  const {tenantId,resource:value,id}=await params;
  let resource;try{resource=coreResource(value);}catch{throw new DatabaseAccessError("Data tidak ditemukan.",404);}
  return Response.json(await saveRecord(session.user.id,tenantId,resource,await jsonBody(request),id),{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  if(error && typeof error==="object" && "code" in error && error.code==="23505") return apiError(new DatabaseAccessError("Kode, nama, atau nomor tersebut sudah digunakan.",409));
  return apiError(error);
 }
}
