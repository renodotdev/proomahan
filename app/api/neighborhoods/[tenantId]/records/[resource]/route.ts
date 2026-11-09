import { getVerifiedSession } from "@/lib/neon/auth-server";
import { listRecords,saveBulkRecords,saveRecord } from "@/lib/neon/core-records";
import { coreResource } from "@/lib/neon/core-input";
import { DatabaseAccessError } from "@/lib/neon/tenant-context";
import { assertSameOrigin,jsonBody,apiError } from "@/lib/neon/request";
export const dynamic="force-dynamic";
type Context={params:Promise<{tenantId:string;resource:string}>};
async function handle(request:Request,context:Context) {
 try{
  const {data:session}=await getVerifiedSession();
  if(!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.",401);
  const {tenantId,resource:value}=await context.params;
  let resource;try{resource=coreResource(value);}catch{throw new DatabaseAccessError("Data tidak ditemukan.",404);}
  if(request.method==="POST") assertSameOrigin(request);
  if(request.method==="GET") return Response.json(await listRecords(session.user.id,tenantId,resource,new URL(request.url)),{headers:{"Cache-Control":"private, no-store"}});
  const body=await jsonBody(request);
  const result=Object.hasOwn(body,"bulkText")
   ? await saveBulkRecords(session.user.id,tenantId,resource,body.bulkText)
   : await saveRecord(session.user.id,tenantId,resource,body);
  return Response.json(result,{status:201,headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  if(error && typeof error==="object" && "code" in error){
   if(error.code==="23505") return apiError(new DatabaseAccessError("Kode, nama, atau nomor tersebut sudah digunakan.",409));
   if(error.code==="23514" || error.code==="23503") return apiError(new DatabaseAccessError("Data tidak sesuai. Periksa klaster dan isian formulir.",400));
  }
  return apiError(error);
 }
}
export const GET=handle;
export const POST=handle;
