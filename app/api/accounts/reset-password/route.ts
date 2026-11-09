import { getAuthAdmin,getVerifiedSession } from "@/lib/neon/auth-server";
import { getDatabase } from "@/lib/neon/database";
import { withActorTenant,DatabaseAccessError,validUuid } from "@/lib/neon/tenant-context";
import { assertSameOrigin,jsonBody,apiError } from "@/lib/neon/request";
export async function POST(request:Request){
 try{
  assertSameOrigin(request);
  const {data:session}=await getVerifiedSession();
  if(!session?.user)throw new DatabaseAccessError("Silakan masuk terlebih dahulu.",401);
  const body=await jsonBody(request);
  if(typeof body.tenantId!=="string"||!validUuid(body.tenantId)||typeof body.personId!=="string"||!validUuid(body.personId)||typeof body.password!=="string"||body.password.length<12||body.password.length>128)throw new DatabaseAccessError("Gunakan kata sandi sementara sepanjang 12–128 karakter.",400);
  const userId=await withActorTenant(session.user.id,body.tenantId,async db=>{
   const result=await db.query<{user_id:string}>("SELECT user_id FROM app.tenant_memberships WHERE tenant_id=$1 AND person_id=$2 AND status='active'",[body.tenantId,body.personId]);
   if(!result.rows.length)throw new DatabaseAccessError("Akun aktif tidak ditemukan.",404);
   if(result.rows[0].user_id===session.user.id)throw new DatabaseAccessError("Gunakan menu ubah kata sandi untuk akun sendiri.",400);
   return result.rows[0].user_id;
  },["super_admin"]);
  // Close access before changing credentials; a provider failure leaves a safe password-change gate.
  await getDatabase().query("UPDATE app.user_profiles SET must_change_password=true WHERE user_id=$1",[userId]);
  const admin=getAuthAdmin();
  const changed=await admin.setUserPassword({userId,newPassword:body.password});
  if(changed.error)throw new DatabaseAccessError("Kata sandi belum dapat diatur ulang. Silakan coba lagi.",503);
  const revoked=await admin.revokeUserSessions({userId});
  if(revoked.error)throw new DatabaseAccessError("Sesi belum seluruhnya ditutup. Silakan ulangi pengaturan kata sandi.",503);
  await getDatabase().query("INSERT INTO app.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,'account.password_reset','user',$3)",[body.tenantId,session.user.id,userId]);
  return Response.json({success:true},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return apiError(error);}
}
