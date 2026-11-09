import { getAuth,getVerifiedSession } from "@/lib/neon/auth-server";
import { getDatabase } from "@/lib/neon/database";
import { assertSameOrigin,jsonBody,apiError } from "@/lib/neon/request";
import { DatabaseAccessError } from "@/lib/neon/tenant-context";
export async function POST(request:Request) {
 try{
  assertSameOrigin(request);
  const auth=getAuth();const {data:session}=await getVerifiedSession();
  if(!session?.user) throw new DatabaseAccessError("Silakan masuk terlebih dahulu.",401);
  const body=await jsonBody(request);
  if(typeof body.currentPassword!=="string" || typeof body.newPassword!=="string" || body.newPassword.length<12 || body.newPassword.length>128 || body.currentPassword===body.newPassword) throw new DatabaseAccessError("Gunakan kata sandi baru yang berbeda, sepanjang 12–128 karakter.",400);
  const {error}=await auth.changePassword({currentPassword:body.currentPassword,newPassword:body.newPassword,revokeOtherSessions:true});
  if(error) throw new DatabaseAccessError("Kata sandi saat ini tidak sesuai atau kata sandi baru belum dapat digunakan.",400);
  await getDatabase().query("UPDATE app.user_profiles SET must_change_password=false WHERE user_id=$1 AND status='active'",[session.user.id]);
  return Response.json({success:true},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return apiError(error);}
}
